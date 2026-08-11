import type { ZodType } from "zod";
import { z } from "zod";
import { AsterError } from "../errors.js";
import type { JsonSchema, ToolSpec } from "../types.js";

/** Ambient context passed to every tool execution. */
export interface ToolContext {
  sessionId: string;
  /** Absolute path of the agent project root. */
  projectDir: string;
  /** Durable per-session key/value state. */
  state: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
  signal: AbortSignal;
  log: (message: string, fields?: Record<string, unknown>) => void;
}

export interface ToolDefinition<Input = unknown, Output = unknown> {
  /** Defaults to the filename when discovered from `agent/tools/`. */
  name?: string;
  description: string;
  inputSchema: ZodType<Input>;
  /** When true, execution pauses until a human approves the call. */
  approval?: boolean;
  /** "none" (default) runs in-process; "process" runs in an isolated child process. */
  isolation?: "none" | "process";
  /** Milliseconds before the call is aborted. Default 60_000. */
  timeoutMs?: number;
  execute(input: Input, ctx: ToolContext): Promise<Output> | Output;
}

export interface Tool<Input = unknown, Output = unknown> extends ToolDefinition<Input, Output> {
  name: string;
  /** Absolute source file path when loaded from disk (required for process isolation). */
  sourcePath?: string;
}

const MARKER = Symbol.for("aster.tool");

/** Define a typed tool. The zod schema validates model-supplied input at runtime. */
export function defineTool<Input, Output>(
  definition: ToolDefinition<Input, Output>,
): ToolDefinition<Input, Output> {
  Object.defineProperty(definition, MARKER, { value: true, enumerable: false });
  return definition;
}

export function isToolDefinition(value: unknown): value is ToolDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (MARKER in value ||
      (typeof (value as ToolDefinition).execute === "function" &&
        typeof (value as ToolDefinition).description === "string" &&
        "inputSchema" in value))
  );
}

export function toolSpec(tool: Tool): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toJsonSchema(tool.inputSchema),
  };
}

export function toJsonSchema(schema: ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as JsonSchema;
  delete json["$schema"];
  if (json["type"] === undefined && json["properties"] !== undefined) json["type"] = "object";
  return json;
}

/** Validate raw model input against the tool schema. */
export function parseToolInput<Input>(tool: Tool<Input>, raw: unknown): Input {
  const result = tool.inputSchema.safeParse(raw ?? {});
  if (!result.success) {
    throw new AsterError(
      "TOOL_INPUT_INVALID",
      `Invalid input for tool "${tool.name}": ${result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
      { tool: tool.name, issues: result.error.issues },
    );
  }
  return result.data;
}
