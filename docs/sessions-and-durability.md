# Sessions & durability

> **TL;DR**
> Every session is an append-only event log plus a small state document under
> `.aster/sessions/<id>/`. Transcript, approvals, traces, and workflow progress
> are all *projections* of the log — so anything can be resumed by replay.

## The model

```
.aster/
└── sessions/
    └── ses_.../
        ├── events.jsonl   # append-only: every message, model call, tool call…
        └── state.json     # key/value: tool state, workflow step memos
```

One design rule drives everything: **the event log is the source of truth**.
Opening a session replays its events to rebuild the transcript, the pending
approvals, and the status. Nothing important lives only in memory.

| Event | Meaning |
| ----- | ------- |
| `message.appended` | A transcript message (user, assistant, or tool results). |
| `model.request` / `model.response` | One model call with usage and duration. |
| `tool.call` / `tool.result` | One tool execution with input, output, error flag. |
| `approval.requested` / `approval.resolved` | Human-in-the-loop lifecycle. |
| `step.completed` | A durable workflow step finished. |
| `run.started` / `run.finished` | One agentic loop invocation and its outcome. |

## What survives what

| Failure | Outcome |
| ------- | ------- |
| Process crash mid-run | Log ends without `run.finished`; reopening recovers the session as `idle` (or `waiting_approval` if approvals are outstanding). The transcript is intact; send the next message. |
| Crash mid-append | A torn final JSONL line is tolerated and dropped; earlier corruption fails loudly with `SESSION_CORRUPT`. |
| Restart while waiting for approval | The pause is durable. `agent.approve(...)` in a *new process* executes the tool and resumes the loop. |
| Crash between workflow steps | Completed steps replay from state; execution continues at the first incomplete step. |
| `state.json` write interrupted | Writes go to a temp file then `rename` (atomic on POSIX); the previous state remains. |

## Working with sessions

```sh
aster inspect sessions                 # list
aster inspect session <id>             # transcript, state, pending approvals
aster inspect session <id> --json      # machine-readable, add --events for the raw log
```

Programmatically:

```ts
const agent = new Agent(await loadProject("."));
const result = await agent.send("support-4812", "Where is my order?");
// Same id next week, next deploy, next machine — same conversation.
```

## Storage backends

The default store is the local filesystem — zero setup, and inspectable with
`cat` and `jq`. The `SessionStore` interface (append/read events, read/write
state, list) is deliberately tiny so SQLite, Postgres, or object-storage
implementations can be swapped in via `defineAgent({ store })` without
touching the runtime.

> **Note**
> The file store assumes one writer per session at a time. Run one runtime
> instance per `.aster/` directory, or use session-id sharding across
> instances. A locking/multi-writer store is an open item — see the README's
> known limitations.
