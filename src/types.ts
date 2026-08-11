/**
 * Shared core types. Everything here is provider-agnostic and serializable
 * (transcripts are persisted verbatim into the session event log).
 */

/** A single content part of a message. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      toolCallId: string;
      name: string;
      output: unknown;
      isError?: boolean;
    };

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: ContentPart[];
}

/** Convenience constructors used across the runtime. */
export const text = (t: string): ContentPart => ({ type: "text", text: t });

export function userMessage(t: string): Message {
  return { role: "user", content: [text(t)] };
}

export function messageText(message: Message): string {
  return message.content
    .filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** JSON Schema object handed to providers for tool definitions. */
export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/** What the model returned for one turn. */
export interface ModelTurn {
  message: Message;
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** Streaming deltas surfaced by providers. */
export type ModelDelta =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "turn_complete"; turn: ModelTurn };

export interface ModelRequest {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface Provider {
  /** Registry key, e.g. "anthropic". Model strings are `<name>/<model>`. */
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelTurn>;
  stream?(request: ModelRequest): AsyncIterable<ModelDelta>;
}

/** Result of a completed agent run. */
export interface RunResult {
  sessionId: string;
  status: "completed" | "waiting_approval" | "failed" | "max_steps";
  /** Final assistant text, if the run completed. */
  output: string;
  /** Tool calls awaiting human approval, when status is "waiting_approval". */
  pendingApprovals: PendingApproval[];
  steps: number;
  usage: { inputTokens: number; outputTokens: number };
}

export interface PendingApproval {
  toolCallId: string;
  tool: string;
  input: unknown;
  requestedAt: string;
}
