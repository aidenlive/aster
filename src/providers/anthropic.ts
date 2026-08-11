import type {
  ContentPart,
  Message,
  ModelDelta,
  ModelRequest,
  ModelTurn,
  Provider,
} from "../types.js";
import { providerFetch, requireEnv } from "./http.js";

interface AnthropicOptions {
  apiKey?: string;
  baseUrl?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/** Anthropic Messages API provider. Uses fetch only — no SDK dependency. */
export function anthropic(options: AnthropicOptions = {}): Provider {
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com";

  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    "x-api-key": options.apiKey ?? requireEnv("ANTHROPIC_API_KEY", "anthropic"),
    "anthropic-version": "2023-06-01",
  });

  function toApiMessages(messages: Message[]): unknown[] {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "tool" ? "user" : m.role,
        content: m.content.map((part): AnthropicContentBlock => {
          switch (part.type) {
            case "text":
              return { type: "text", text: part.text };
            case "tool_call":
              return { type: "tool_use", id: part.id, name: part.name, input: part.input };
            case "tool_result":
              return {
                type: "tool_result",
                tool_use_id: part.toolCallId,
                content: typeof part.output === "string" ? part.output : JSON.stringify(part.output),
                is_error: part.isError ?? false,
              };
          }
        }),
      }));
  }

  function fromApiContent(blocks: AnthropicContentBlock[]): ContentPart[] {
    const parts: ContentPart[] = [];
    for (const block of blocks) {
      if (block.type === "text" && typeof block.text === "string") {
        parts.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use" && block.id && block.name) {
        parts.push({ type: "tool_call", id: block.id, name: block.name, input: block.input ?? {} });
      }
    }
    return parts;
  }

  async function generate(request: ModelRequest): Promise<ModelTurn> {
    const body = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.system ? { system: request.system } : {}),
      messages: toApiMessages(request.messages),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema,
            })),
          }
        : {}),
    };
    const response = await providerFetch(
      `${baseUrl}/v1/messages`,
      { method: "POST", headers: headers(), body: JSON.stringify(body), signal: request.signal ?? null },
      { providerName: "anthropic" },
    );
    const data = (await response.json()) as {
      content: AnthropicContentBlock[];
      stop_reason: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      message: { role: "assistant", content: fromApiContent(data.content) },
      stopReason:
        data.stop_reason === "tool_use"
          ? "tool_use"
          : data.stop_reason === "max_tokens"
            ? "max_tokens"
            : data.stop_reason === "end_turn"
              ? "end_turn"
              : "other",
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
    };
  }

  async function* stream(request: ModelRequest): AsyncIterable<ModelDelta> {
    // Streaming falls back to generate() and emits the final turn as deltas.
    // SSE streaming is a planned enhancement; the interface is stable.
    const turn = await generate(request);
    for (const part of turn.message.content) {
      if (part.type === "text") yield { type: "text_delta", text: part.text };
      if (part.type === "tool_call") yield { type: "tool_call_start", id: part.id, name: part.name };
    }
    yield { type: "turn_complete", turn };
  }

  return { name: "anthropic", generate, stream };
}
