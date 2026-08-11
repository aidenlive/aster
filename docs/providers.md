# Providers

> **TL;DR**
> Model strings are `<provider>/<model>`. Anthropic, OpenAI(-compatible), and
> an offline mock ship built in; a provider is one small interface away.

## Choosing a model

```ts
// agent/agent.ts
import { defineAgent } from "aster";

export default defineAgent({
  model: "anthropic/claude-sonnet-4-6",
});
```

| Prefix | Backend | Credential |
| ------ | ------- | ---------- |
| `anthropic/…` | Anthropic Messages API | `ANTHROPIC_API_KEY` |
| `openai/…` | OpenAI Chat Completions | `OPENAI_API_KEY` |
| `mock/…` | Deterministic offline provider | none |

`ASTER_OFFLINE=1` overrides any configured model with `mock/echo` — useful for
CI, demos, and learning the framework without credentials.

## OpenAI-compatible servers (Ollama, vLLM, …)

```ts
import { defineAgent } from "aster";
import { openai } from "aster/providers";

export default defineAgent({
  model: "ollama/llama3.3",
  providers: [openai({ name: "ollama", baseUrl: "http://localhost:11434", apiKey: "unused" })],
});
```

## Writing a provider

A provider is one object:

```ts
import type { Provider } from "aster";

const myProvider: Provider = {
  name: "acme",
  async generate(request) {
    // request: { model, system, messages, tools, maxTokens, temperature }
    // return: { message, stopReason, usage }
  },
  // optional: stream(request): AsyncIterable<ModelDelta>
};
```

The message format is provider-agnostic and serializable: `text`, `tool_call`,
and `tool_result` content parts. Providers translate to and from their wire
format; the runtime never sees provider-specific shapes.

> **Note**
> Requests retry automatically on 429/5xx with exponential backoff. The
> built-in providers currently implement `stream` on top of `generate`
> (chunked after completion); token-level SSE streaming is a planned
> enhancement behind the same interface.
