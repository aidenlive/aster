import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { AsterError, serializeError } from "../errors.js";
import type { AgentConfig } from "../agent/define.js";
import { agentConfigSchema } from "../agent/define.js";
import { isToolDefinition, type Tool } from "../tools/define.js";
import { ToolRegistry } from "../tools/registry.js";
import { parseSkill, SkillRegistry } from "../skills/skills.js";
import type { SubagentDefinition } from "../subagents/subagents.js";
import { isWorkflowDefinition, type Workflow } from "../workflows/workflow.js";
import { isChannelDefinition, type Channel } from "../channels/define.js";
import { isScheduleDefinition, type Schedule } from "../schedules/define.js";
import { discoverProject, readInstructions, type ProjectManifest } from "./discover.js";

export interface LoadedProject {
  manifest: ProjectManifest;
  config: AgentConfig;
  instructions: string;
  tools: ToolRegistry;
  skills: SkillRegistry;
  subagents: SubagentDefinition[];
  /** Tool registries for each subagent, keyed by subagent name. */
  subagentTools: Map<string, ToolRegistry>;
  workflows: Workflow[];
  channels: Channel[];
  schedules: Schedule[];
}

/**
 * Import a project module. Node >=22.18 strips TypeScript types natively, so
 * user `.ts` files load with no build step. Cache is busted per generation so
 * `aster dev` can hot-reload edited files.
 */
async function importModule(path: string, generation: number): Promise<Record<string, unknown>> {
  const url = `${pathToFileURL(path).href}?gen=${generation}`;
  try {
    return (await import(url)) as Record<string, unknown>;
  } catch (error) {
    throw new AsterError("MODULE_LOAD_FAILED", `Failed to load ${path}: ${serializeError(error).message}`, {
      path,
    });
  }
}

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function validateName(kind: string, name: string, path: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new AsterError(
      "PROJECT_INVALID",
      `${kind} name "${name}" (${path}) must be lower_snake_case matching ${NAME_PATTERN}`,
    );
  }
}

async function loadTools(
  files: Array<{ name: string; path: string }>,
  generation: number,
): Promise<ToolRegistry> {
  const registry = new ToolRegistry();
  for (const file of files) {
    const mod = await importModule(file.path, generation);
    const def = mod.default;
    if (!isToolDefinition(def)) {
      throw new AsterError(
        "PROJECT_INVALID",
        `${file.path} must default-export defineTool({...})`,
      );
    }
    const name = def.name ?? file.name;
    validateName("Tool", name, file.path);
    const tool: Tool = { ...def, name, sourcePath: file.path };
    registry.register(tool);
  }
  return registry;
}

export async function loadProject(
  projectDir: string,
  options: { generation?: number } = {},
): Promise<LoadedProject> {
  const generation = options.generation ?? 0;
  const manifest = await discoverProject(projectDir);
  const instructions = await readInstructions(manifest);

  let config: AgentConfig = {};
  if (manifest.configPath) {
    const mod = await importModule(manifest.configPath, generation);
    const raw = (mod.default ?? {}) as AgentConfig;
    const parsed = agentConfigSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AsterError(
        "CONFIG_INVALID",
        `Invalid ${manifest.configPath}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }
    config = raw;
  }

  const tools = await loadTools(manifest.toolFiles, generation);

  const skills = new SkillRegistry();
  for (const file of manifest.skillFiles) {
    const raw = await readFile(file.path, "utf8");
    skills.register(parseSkill(raw, file.name, file.path));
  }

  const subagents: SubagentDefinition[] = [];
  const subagentTools = new Map<string, ToolRegistry>();
  for (const sub of manifest.subagentDirs) {
    validateName("Subagent", sub.name, sub.dir);
    const raw = (await readFile(sub.instructionsPath, "utf8")).trim();
    if (!raw) throw new AsterError("PROJECT_INVALID", `${sub.instructionsPath} is empty`);
    const { frontmatter, body } = splitSubagentFrontmatter(raw);
    subagents.push({
      name: sub.name,
      description: frontmatter.description ?? body.split(/\r?\n/, 1)[0]!.slice(0, 200),
      instructions: body,
      model: frontmatter.model,
      dir: sub.dir,
    });
    subagentTools.set(sub.name, await loadTools(sub.toolFiles, generation));
  }

  const workflows: Workflow[] = [];
  for (const file of manifest.workflowFiles) {
    const mod = await importModule(file.path, generation);
    if (!isWorkflowDefinition(mod.default)) {
      throw new AsterError("PROJECT_INVALID", `${file.path} must default-export defineWorkflow({...})`);
    }
    const name = mod.default.name ?? file.name;
    validateName("Workflow", name, file.path);
    workflows.push({ ...mod.default, name, sourcePath: file.path });
  }

  const channels: Channel[] = [];
  for (const file of manifest.channelFiles) {
    const mod = await importModule(file.path, generation);
    if (!isChannelDefinition(mod.default)) {
      throw new AsterError("PROJECT_INVALID", `${file.path} must default-export defineChannel({...})`);
    }
    const name = mod.default.name ?? file.name;
    validateName("Channel", name, file.path);
    channels.push({ ...mod.default, name, sourcePath: file.path });
  }

  const schedules: Schedule[] = [];
  for (const file of manifest.scheduleFiles) {
    const mod = await importModule(file.path, generation);
    if (!isScheduleDefinition(mod.default)) {
      throw new AsterError("PROJECT_INVALID", `${file.path} must default-export defineSchedule({...})`);
    }
    const name = mod.default.name ?? file.name;
    validateName("Schedule", name, file.path);
    schedules.push({ ...mod.default, name, sourcePath: file.path });
  }

  return {
    manifest,
    config,
    instructions,
    tools,
    skills,
    subagents,
    subagentTools,
    workflows,
    channels,
    schedules,
  };
}

function splitSubagentFrontmatter(raw: string): {
  frontmatter: { description?: string; model?: string };
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) frontmatter[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, "").trim();
  }
  return { frontmatter, body: raw.slice(match[0].length).trim() };
}
