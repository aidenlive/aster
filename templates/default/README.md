# My agent

An [aster](https://github.com/aster-framework/aster) agent. The `agent/`
directory is the agent: instructions, tools, and skills live in conventional
locations and are discovered automatically.

## Run it

```sh
npm install
export ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY + model in agent/agent.ts
npx aster dev                  # interactive chat + HTTP server + hot reload
```

No key yet? `export ASTER_OFFLINE=1` runs against a deterministic mock model.

## Grow it

| Add a…    | Create…                              |
| --------- | ------------------------------------ |
| tool      | `agent/tools/<name>.ts`              |
| skill     | `agent/skills/<name>.md`             |
| subagent  | `agent/subagents/<name>/instructions.md` |
| workflow  | `agent/workflows/<name>.ts`          |
| channel   | `agent/channels/<name>.ts`           |
| schedule  | `agent/schedules/<name>.ts`          |

Then check and ship:

```sh
npx aster build     # release gate
npx aster deploy    # production bundle in dist-deploy/
```

Full docs: `node_modules/aster/docs/`.
