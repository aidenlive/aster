/**
 * Test utilities: build an in-memory agent around the mock provider without a
 * project directory on disk (sessions still persist under the given root).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "../agent/agent.js";
import type { LoadedProject } from "../project/load.js";
import { mock, type MockScript } from "../providers/mock.js";
import { SkillRegistry, parseSkill } from "../skills/skills.js";
import { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/define.js";

export { mock, type MockScript } from "../providers/mock.js";

export interface TestAgentOptions {
  instructions?: string;
  tools?: Tool[];
  skills?: Array<{ name: string; body: string }>;
  script?: MockScript;
  maxSteps?: number;
  projectDir?: string;
}

export function createTestAgent(options: TestAgentOptions = {}): {
  agent: Agent;
  provider: ReturnType<typeof mock>;
  projectDir: string;
} {
  const projectDir = options.projectDir ?? mkdtempSync(join(tmpdir(), "aster-test-"));
  const tools = new ToolRegistry();
  for (const tool of options.tools ?? []) tools.register(tool);
  const skills = new SkillRegistry();
  for (const skill of options.skills ?? []) {
    skills.register(parseSkill(skill.body, skill.name, `<memory:${skill.name}>`));
  }
  const provider = mock({ script: options.script });
  const project: LoadedProject = {
    manifest: {
      projectDir,
      agentDir: join(projectDir, "agent"),
      name: "test-agent",
      instructionsPath: join(projectDir, "agent", "instructions.md"),
      toolFiles: [],
      skillFiles: [],
      subagentDirs: [],
      workflowFiles: [],
      channelFiles: [],
      scheduleFiles: [],
    },
    config: { model: "mock/echo", maxSteps: options.maxSteps ?? 24, providers: [provider] },
    instructions: options.instructions ?? "You are a test agent.",
    tools,
    skills,
    subagents: [],
    subagentTools: new Map(),
    workflows: [],
    channels: [],
    schedules: [],
  };
  return { agent: new Agent(project), provider, projectDir };
}
