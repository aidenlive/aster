# Tools

> **TL;DR**
> A tool is a file in `agent/tools/` default-exporting `defineTool` with a
> description, a zod schema, and an `execute` function. Input is validated,
> errors become model-visible results, and two flags add human approval and
> process isolation.

## Anatomy

```ts
import { defineTool } from "aster/tools";
import { z } from "zod";

export default defineTool({
  description: "Search the product catalog.",   // what the model reads
  inputSchema: z.object({
    query: z.string().min(1).describe("Free-text search query"),
    limit: z.number().int().max(50).default(10),
  }),
  async execute({ query, limit }, ctx) {
    ctx.log("searching", { query });
    return await searchCatalog(query, limit);   // any JSON-serializable value
  },
});
```

The zod schema is converted to JSON Schema for the provider and used to
validate every call at runtime — the model cannot hand your code malformed
input. `.describe()` strings become parameter documentation the model sees.

## The context

`execute(input, ctx)` receives:

| Field | Purpose |
| ----- | ------- |
| `ctx.state.get/set` | Durable per-session key/value storage (survives restarts). |
| `ctx.sessionId` | The current session. |
| `ctx.projectDir` | Absolute project root, for file paths. |
| `ctx.signal` | AbortSignal; fires at the timeout. |
| `ctx.log` | Writes into the session event log (visible in `aster inspect`). |

## Failure behavior

A thrown error does **not** end the run. It is recorded as an error event and
returned to the model as an error result, so the model can retry, work around
it, or explain the problem. Timeouts (default 60s, per-tool `timeoutMs`)
behave the same way.

## Human-in-the-loop

```ts
export default defineTool({
  description: "Refund a customer order.",
  approval: true,           // ← pause here until a human decides
  inputSchema: z.object({ orderId: z.string(), amountCents: z.number().int() }),
  async execute(input) { /* ... */ },
});
```

When the model calls an `approval: true` tool, the run **pauses durably**: the
session status becomes `waiting_approval` and survives restarts. Approve or
deny from `aster dev` (`/approve <id>`), or programmatically with
`agent.approve(sessionId, toolCallId)` / `agent.deny(...)`. On approval the
tool runs and the loop resumes; on denial the model is told and continues.

## Isolation

```ts
export default defineTool({
  description: "Run untrusted text through a parser.",
  isolation: "process",     // ← fresh child process per call
  /* ... */
});
```

> **Warning**
> By default tools run in the agent's process with the agent's environment.
> `isolation: "process"` re-imports the tool file in a child process with a
> **minimal environment** — no API keys unless you allowlist variables via
> `ASTER_SANDBOX_ENV=VAR1,VAR2`. A crash or hang in the tool kills only the
> child. Sandboxed tools cannot write session state.

## Naming

Tool names are `lower_snake_case`, taken from the filename. Duplicate names
across `tools/` fail at load time, loudly.
