import type {
  ContentPart,
  Message,
  ModelDelta,
  ModelRequest,
  ModelTurn,
  Provider,
} from "../types.js";
import { messageText } from "../types.js";
import { providerFetch, requireEnv } from "./http.js";

interface OpenAIOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Set for OpenAI-compatible servers (Ollama, vLLM, etc.). */
  name?: string;
}

/** OpenAI Chat Completions provider; also works with OpenAI-compatible endpoints. */
export function openai(options: OpenAIOptions = {}): Provider {
  const baseUrl = options.baseUrl ?? "https://api.openai.com";
  const name = options.name ?? "openai";

  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    authorization: `Bearer ${options.apiKey ?? requireEnv("OPENAI_API_KEY", name)}`,
  });

  function toApiMessages(system: string | undefined, messages: Message[]): unknown[] {
    const out: unknown[] = [];
    if (system) out.push({ role: "system", content: system });
    for (const message of messages) {
      const toolCalls = message.content.filter(
        (p): p is Extract<ContentPart, { type: "tool_call" }> => p.type === "tool_call",
      );
      const toolResults = message.content.filter(
        (p): p is Extract<ContentPart, { type: "tool_result" }> => p.type === "tool_result",
      );
      if (message.role === "assistant") {
        out.push({
          role: "assistant",
          content: messageText(message) || null,
          ...(toolCalls.length
            ? {
                tool_calls: toolCalls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
                })),
              }
            : {}),
        });
      } else if (toolResults.length) {
        for (const result of toolResults) {
          out.push({
            role: "tool",
            tool_call_id: result.toolCallId,
            content: typeof result.output === "string" ? result.output : JSON.stringify(result.output),
          });
        }
      } else {
        out.push({ role: "user", content: messageText(message) });
      }
    }
    return out;
  }

  async function generate(request: ModelRequest): Promise<ModelTurn> {
    const body = {
      model: request.model,
      messages: toApiMessages(request.system, request.messages),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
          }
        : {}),
    };
    const response = await providerFetch(
      `${baseUrl}/v1/chat/completions`,
      { method: "POST", headers: headers(), body: JSON.stringify(body), signal: request.signal ?? null },
      { providerName: name },
    );
    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = data.choices[0];
    const content: ContentPart[] = [];
    if (choice?.message.content) content.push({ type: "text", text: choice.message.content });
    for (const call of choice?.message.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        input = { _raw: call.function.arguments };
      }
      content.push({ type: "tool_call", id: call.id, name: call.function.name, input });
    }
    return {
      message: { role: "assistant", content },
      stopReason:
        choice?.finish_reason === "tool_calls"
          ? "tool_use"
          : choice?.finish_reason === "length"
            ? "max_tokens"
            : choice?.finish_reason === "stop"
              ? "end_turn"
              : "other",
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
    };
  }

  async function* stream(request: ModelRequest): AsyncIterable<ModelDelta> {
    const turn = await generate(request);
    for (const part of turn.message.content) {
      if (part.type === "text") yield { type: "text_delta", text: part.text };
      if (part.type === "tool_call") yield { type: "tool_call_start", id: part.id, name: part.name };
    }
    yield { type: "turn_complete", turn };
  }

  return { name, generate, stream };
}
