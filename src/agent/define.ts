import { z } from "zod";
import type { Provider } from "../types.js";
import type { SessionStore } from "../runtime/store.js";

/**
 * Optional per-project configuration, exported as the default from
 * `agent/agent.ts`. Every field has a sensible default so a project with only
 * `agent/instructions.md` runs.
 */
export interface AgentConfig {
  /** Display/name of the agent. Defaults to the project directory name. */
  name?: string;
  /** "<provider>/<model>". Default: "anthropic/claude-sonnet-4-6" (or "mock/echo" with ASTER_OFFLINE=1). */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Hard cap on model↔tool iterations per run. Default 24. */
  maxSteps?: number;
  /** Additional providers beyond the built-ins (anthropic, openai, mock). */
  providers?: Provider[];
  /** Custom durable store; defaults to the filesystem under `.aster/`. */
  store?: SessionStore;
  /** Default timeout for tool executions in ms. Default 60_000. */
  toolTimeoutMs?: number;
}

export const agentConfigSchema = z.object({
  name: z.string().min(1).optional(),
  model: z.string().regex(/^[\w.-]+\/.+$/, 'model must be "<provider>/<model>"').optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxSteps: z.number().int().positive().max(500).optional(),
  toolTimeoutMs: z.number().int().positive().optional(),
});

const MARKER = Symbol.for("aster.agent");

export function defineAgent(config: AgentConfig): AgentConfig {
  const parsed = agentConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid agent config: ${issues}`);
  }
  Object.defineProperty(config, MARKER, { value: true, enumerable: false });
  return config;
}
