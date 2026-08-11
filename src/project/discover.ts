import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { AsterError } from "../errors.js";

/**
 * Discovery walks a project and produces a manifest of what exists, without
 * importing any code. Loading (importing modules, validating exports) is a
 * separate phase in `load.ts`, so `aster inspect project` can describe a
 * project even when one of its files fails to compile.
 *
 * Conventions:
 *   agent/instructions.md          required — the always-on system prompt
 *   agent/agent.ts|js              optional config (defineAgent)
 *   agent/tools/<name>.ts|js       tools; name defaults to the filename
 *   agent/skills/<name>.md         skills (or <name>/SKILL.md)
 *   agent/subagents/<name>/        nested agents (instructions.md + tools/)
 *   agent/workflows/<name>.ts|js   durable workflows
 *   agent/channels/<name>.ts|js    channels
 *   agent/schedules/<name>.ts|js   schedules
 */

export interface ProjectManifest {
  projectDir: string;
  agentDir: string;
  name: string;
  instructionsPath: string;
  configPath?: string;
  toolFiles: Array<{ name: string; path: string }>;
  skillFiles: Array<{ name: string; path: string }>;
  subagentDirs: Array<{ name: string; dir: string; instructionsPath: string; toolFiles: Array<{ name: string; path: string }> }>;
  workflowFiles: Array<{ name: string; path: string }>;
  channelFiles: Array<{ name: string; path: string }>;
  scheduleFiles: Array<{ name: string; path: string }>;
}

const CODE_EXTENSIONS = [".ts", ".mts", ".js", ".mjs"];

function isCodeFile(name: string): boolean {
  return CODE_EXTENSIONS.some((ext) => name.endsWith(ext)) && !name.endsWith(".d.ts");
}

function moduleName(file: string): string {
  return basename(file).replace(/\.(m?[tj]s)$/, "");
}

async function listCodeFiles(dir: string): Promise<Array<{ name: string; path: string }>> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && isCodeFile(e.name))
    .map((e) => ({ name: moduleName(e.name), path: join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function findConfig(agentDir: string): Promise<string | undefined> {
  for (const ext of CODE_EXTENSIONS) {
    const path = join(agentDir, `agent${ext}`);
    if (existsSync(path)) return path;
  }
  return undefined;
}

async function listSkills(dir: string): Promise<Array<{ name: string; path: string }>> {
  if (!existsSync(dir)) return [];
  const skills: Array<{ name: string; path: string }> = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      skills.push({ name: entry.name.replace(/\.md$/, ""), path: join(dir, entry.name) });
    } else if (entry.isDirectory()) {
      const nested = join(dir, entry.name, "SKILL.md");
      if (existsSync(nested)) skills.push({ name: entry.name, path: nested });
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverProject(projectDirInput: string): Promise<ProjectManifest> {
  const projectDir = resolve(projectDirInput);
  const agentDir = join(projectDir, "agent");
  if (!existsSync(agentDir)) {
    throw new AsterError(
      "PROJECT_NOT_FOUND",
      `No "agent/" directory found in ${projectDir}. Run "aster init" to scaffold one.`,
    );
  }
  const instructionsPath = join(agentDir, "instructions.md");
  if (!existsSync(instructionsPath)) {
    throw new AsterError(
      "PROJECT_INVALID",
      `Missing required ${instructionsPath}. Every agent needs instructions.md.`,
    );
  }

  const subagentDirs: ProjectManifest["subagentDirs"] = [];
  const subagentsRoot = join(agentDir, "subagents");
  if (existsSync(subagentsRoot)) {
    for (const entry of await readdir(subagentsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(subagentsRoot, entry.name);
      const subInstructions = join(dir, "instructions.md");
      if (!existsSync(subInstructions)) {
        throw new AsterError(
          "PROJECT_INVALID",
          `Subagent "${entry.name}" is missing ${subInstructions}`,
        );
      }
      subagentDirs.push({
        name: entry.name,
        dir,
        instructionsPath: subInstructions,
        toolFiles: await listCodeFiles(join(dir, "tools")),
      });
    }
    subagentDirs.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    projectDir,
    agentDir,
    name: basename(projectDir),
    instructionsPath,
    configPath: await findConfig(agentDir),
    toolFiles: await listCodeFiles(join(agentDir, "tools")),
    skillFiles: await listSkills(join(agentDir, "skills")),
    subagentDirs,
    workflowFiles: await listCodeFiles(join(agentDir, "workflows")),
    channelFiles: await listCodeFiles(join(agentDir, "channels")),
    scheduleFiles: await listCodeFiles(join(agentDir, "schedules")),
  };
}

export async function readInstructions(manifest: ProjectManifest): Promise<string> {
  const raw = await readFile(manifest.instructionsPath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AsterError("PROJECT_INVALID", `${manifest.instructionsPath} is empty`);
  }
  return trimmed;
}

export async function projectMtime(manifest: ProjectManifest): Promise<number> {
  const paths = [
    manifest.instructionsPath,
    manifest.configPath,
    ...manifest.toolFiles.map((f) => f.path),
    ...manifest.skillFiles.map((f) => f.path),
    ...manifest.workflowFiles.map((f) => f.path),
    ...manifest.channelFiles.map((f) => f.path),
    ...manifest.scheduleFiles.map((f) => f.path),
  ].filter((p): p is string => Boolean(p));
  let latest = 0;
  for (const path of paths) {
    try {
      latest = Math.max(latest, (await stat(path)).mtimeMs);
    } catch {
      /* file removed between scans */
    }
  }
  return latest;
}
