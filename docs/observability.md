# Observability

> **TL;DR**
> Nothing is instrumented twice: the session event log *is* the trace.
> `aster inspect` renders it; `--json` feeds it to your tooling.

## From the terminal

```sh
aster inspect project              # what was discovered and loaded
aster inspect sessions             # every durable session
aster inspect session <id>         # transcript + pending approvals + state
aster inspect session <id> --json --events    # the raw event log
aster inspect trace <id>           # spans per run
```

A trace groups events into runs and spans:

```
run run_01hx…  trigger=message  status=completed  tokens=812in/64out
  ◆ anthropic/claude-sonnet-4-6  1240ms  ok
  ▸ get_weather  35ms  ok
  ◆ anthropic/claude-sonnet-4-6  980ms  ok
```

`◆` is a model call, `▸` a tool call — each with duration, status, and (in
`--json`) full inputs and outputs.

## Logging

Structured logging goes to stderr:

| Variable | Values | Effect |
| -------- | ------ | ------ |
| `ASTER_LOG_LEVEL` | `debug` `info` `warn` `error` | Verbosity. |
| `ASTER_LOG_FORMAT` | `json` | JSON lines for log shippers. |

Inside tools, `ctx.log(...)` writes into the session event log itself, so
tool-level diagnostics appear in `inspect` next to the calls they explain.

## Programmatic access

```ts
const session = await agent.session("support-4812");
const records = await session.events();           // full log
session.onEvent((record) => metrics.push(record)); // live tail

import { buildTraces } from "aster/runtime";       // spans, if you want them shaped
```

> **Tip**
> Because events are plain JSONL on disk, `jq` is a complete analysis tool:
> `jq 'select(.event.type=="tool.result") | .event.tool' .aster/sessions/*/events.jsonl`
