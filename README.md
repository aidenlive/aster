# aster

**A filesystem-first framework for building durable AI agents.**

An aster agent is a directory. Instructions, tools, skills, subagents,
workflows, channels, and schedules live in conventional locations and are
discovered automatically — like Rails, but the routes are capabilities and
the pages are behavior. Everything the agent does is recorded durably, so runs
survive crashes, restarts, and deploys.

```
my-agent/
└── agent/
    ├── instructions.md      # required: the always-on system prompt
    ├── agent.ts             # optional: model & runtime config
    ├── tools/               # typed functions the model can call
    ├── skills/              # markdown procedures, loaded on demand
    ├── subagents/           # nested specialist agents
    ├── workflows/           # durable multi-step code
    ├── channels/            # HTTP / Slack / anything
    └── schedules/           # cron-driven behavior
```

## Quick start

```sh
npm create aster@latest my-agent    # or: npx aster init my-agent
cd my-agent && npm install
npx aster dev
```

`init` is interactive on a TTY: it asks for your provider (Anthropic, OpenAI,
an OpenAI-compatible endpoint like Ollama or a corporate gateway, or fully
offline), your model, and a starting preset — then writes a `.env` and a
matching `agent/agent.ts`, so the first `aster dev` uses your real setup.
Scriptable via `--yes` and flags.

`aster dev` starts an interactive chat, the HTTP channel, schedules, and hot
reload in one process. Add a tool by adding a file:

```ts
// agent/tools/get_weather.ts
import { defineTool } from "aster/tools";
import { z } from "zod";

export default defineTool({
  description: "Return weather for a city.",
  inputSchema: z.object({ city: z.string().min(1) }),
  async execute({ city }) {
    return { city, condition: "Sunny", temperatureC: 22 };
  },
});
```

No registration, no build step (Node ≥ 22.18 loads TypeScript natively), no
boilerplate beyond the definition itself.

## What you get

| Capability | How |
| ---------- | --- |
| **Durable sessions** | Append-only event log per session; transcript, state, and status replay after any crash or restart. |
| **Human-in-the-loop** | `approval: true` on a tool pauses the run durably until a human approves or denies — even across restarts. |
| **Skills** | Markdown procedures with progressive disclosure: one catalog line in the prompt, full body loaded on demand. |
| **Subagents** | Specialist agents with private tools and their own model, exposed as delegation tools, traced in child sessions. |
| **Durable workflows** | `ctx.step(name, fn)` memoizes completed steps; re-runs resume instead of repeating. |
| **Provider-agnostic** | `anthropic/…`, `openai/…`, OpenAI-compatible servers, and an offline mock; a provider is one small interface. |
| **Channels & schedules** | Built-in HTTP (+SSE streaming); custom channels and five-field cron schedules are single files. |
| **Sandboxing** | `isolation: "process"` runs a tool in a scrubbed-env child process with timeouts. |
| **Observability** | `aster inspect` renders sessions and traces straight from the event log; `--json` everywhere. |

## The CLI

| Command | Does |
| ------- | ---- |
| `aster init` | Scaffold a runnable project |
| `aster dev` | Chat + HTTP + schedules + hot reload |
| `aster run` | One prompt, a workflow, a schedule, or `--serve` for production |
| `aster build` | Release gate: load, schemas, cron, typecheck |
| `aster inspect` | `project` / `sessions` / `session <id>` / `trace <id>` |
| `aster deploy` | Self-contained production bundle with Dockerfile |

## Documentation

Start with [docs/index.md](./docs/index.md) — guides for
[getting started](./docs/getting-started.md),
[project structure](./docs/project-structure.md),
[tools](./docs/tools.md),
[skills & subagents](./docs/skills-and-subagents.md),
[workflows](./docs/workflows.md),
[sessions & durability](./docs/sessions-and-durability.md),
[channels & schedules](./docs/channels-and-schedules.md),
[providers](./docs/providers.md),
[observability](./docs/observability.md),
[deployment](./docs/deployment.md), and the
[architecture](./docs/architecture.md). The docs ship in the package
(`node_modules/aster/docs`), so coding agents can read them locally.

Two worked examples live in [`examples/`](./examples): a minimal
[weather](./examples/weather) agent and a full
[research-team](./examples/research-team) showing every capability together.

## Design principles

- **Small composable core.** One runtime dependency (zod). Each concern —
  discovery, loop, providers, storage, sandbox — is a module with one
  interface that can be replaced without touching the others.
- **The event log is the truth.** Durability, HITL, and tracing are all
  projections of the same append-only log, not separate subsystems.
- **Local-first, production-capable.** The same project runs in `dev`, in
  `run --serve`, and in the container `deploy` emits.

## Known limitations

Honest edges, tracked for future releases: built-in providers stream chunks
after completion rather than token-level SSE; the file store assumes one
writer per session (shard sessions across instances or supply a locking
`SessionStore`); process isolation contains crashes and scrubs the
environment but is not a security boundary for malicious code; the HTTP
channel has no built-in auth. Details and rationale:
[docs/architecture.md](./docs/architecture.md).

## Customizing & white-labeling

Brand your agent freely — name, instructions, endpoints are all per-project.
Wire in existing models or gateways through `init`'s provider options. For
platform teams that need the framework itself under an internal name,
`scripts/rebrand.mjs --name <brand> --i-am-forking --verify` performs a
complete, test-verified rename — documented explicitly as a fork with the
upgrade-path trade-off it implies. Details: [docs/customization.md](./docs/customization.md).

## Contributing & security

See [CONTRIBUTING.md](./CONTRIBUTING.md). Please report vulnerabilities
privately per [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)

---

*aster's architecture takes inspiration from Vercel's eve (filesystem-first
agent authoring) and Atlas (explicit, machine-checked project structure). All
code here is original.*
