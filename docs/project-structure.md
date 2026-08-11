# Project structure

> **TL;DR**
> One required file (`agent/instructions.md`); everything else is optional and
> discovered by location. Names come from filenames. State lives in `.aster/`.

## The layout

```
my-agent/
├── agent/
│   ├── instructions.md        # required — the always-on system prompt
│   ├── agent.ts               # optional — model & runtime config (defineAgent)
│   ├── tools/
│   │   └── get_weather.ts     # defineTool; tool name = filename
│   ├── skills/
│   │   ├── plan_a_trip.md     # markdown procedure, loaded on demand
│   │   └── review_code/SKILL.md   # directory form, same thing
│   ├── subagents/
│   │   └── researcher/
│   │       ├── instructions.md    # frontmatter: description, model
│   │       └── tools/             # tools private to this subagent
│   ├── workflows/
│   │   └── daily_brief.ts     # defineWorkflow; durable steps
│   ├── channels/
│   │   └── slack.ts           # defineChannel; connects the outside world
│   └── schedules/
│       └── weekly_recap.ts    # defineSchedule; five-field cron
├── .aster/                    # durable state (sessions, events) — gitignored
├── package.json
└── tsconfig.json              # optional; `aster build` typechecks if present
```

## Rules

| Rule | Detail |
| ---- | ------ |
| Names | `lower_snake_case`, from the filename (or directory for subagents). Override with `name:` in the definition. |
| Exports | Every code file default-exports its `define*` result. |
| Extensions | `.ts`, `.mts`, `.js`, `.mjs` all work; TypeScript needs no build step. |
| Discovery vs loading | Discovery scans without importing; loading imports and validates. `aster inspect project` uses both, so broken files produce a precise error rather than a silent absence. |

> **Important**
> `.aster/` contains your agent's memory — every session's event log and
> state. It is data, not cache. Git-ignore it in development; mount it as a
> volume in production.

## What gets injected into the prompt

Only three things reach the system prompt: `instructions.md`, the one-line
**skill catalog** (name + description per skill), and the one-line **subagent
catalog**. Skill bodies load on demand via the built-in `use_skill` tool, and
subagents run in their own sessions — the always-on prompt stays small no
matter how much capability the project accumulates.
