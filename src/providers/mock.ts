import { callId } from "../ids.js";
import type { Message, ModelDelta, ModelRequest, ModelTurn, Provider } from "../types.js";
import { messageText } from "../types.js";

export type MockScript = Array<
  | { text: string }
  | { toolCall: { name: string; input?: unknown } }
  | ((request: ModelRequest) => ModelTurn)
>;

export interface MockProviderOptions {
  /** Consumed one entry per generate() call. When exhausted, echoes the last user message. */
  script?: MockScript;
  name?: string;
}

/**
 * Deterministic provider for tests and offline development (`model: "mock/echo"`).
 * Records every request it receives on `.requests`.
 */
export function mock(options: MockProviderOptions = {}): Provider & { requests: ModelRequest[] } {
  const script = [...(options.script ?? [])];
  const requests: ModelRequest[] = [];

  async function generate(request: ModelRequest): Promise<ModelTurn> {
    requests.push(request);
    const entry = script.shift();
    if (typeof entry === "function") return entry(request);
    if (entry && "toolCall" in entry) {
      return {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_call",
              id: callId(),
              name: entry.toolCall.name,
              input: entry.toolCall.input ?? {},
            },
          ],
        },
        stopReason: "tool_use",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    }
    const textOut =
      entry && "text" in entry ? entry.text : `echo: ${lastUserText(request.messages)}`;
    return {
      message: { role: "assistant", content: [{ type: "text", text: textOut }] },
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }

  async function* stream(request: ModelRequest): AsyncIterable<ModelDelta> {
    const turn = await generate(request);
    for (const part of turn.message.content) {
      if (part.type === "text") {
        for (const word of part.text.split(/(?<=\s)/)) yield { type: "text_delta", text: word };
      }
      if (part.type === "tool_call") yield { type: "tool_call_start", id: part.id, name: part.name };
    }
    yield { type: "turn_complete", turn };
  }

  return { name: options.name ?? "mock", generate, stream, requests };
}

function lastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === "user") {
      const text = messageText(message);
      if (text) return text;
    }
  }
  return "";
}
