# Getting started

> **TL;DR**
> `npx aster init my-agent`, add an API key (or `ASTER_OFFLINE=1`), run
> `npx aster dev`, and chat. Add capabilities by adding files.

## Prerequisites

- Node.js **≥ 22.18** — aster loads your TypeScript files directly via Node's
  native type stripping. No build step, no bundler.
- A model API key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`), *or* nothing at
  all: `ASTER_OFFLINE=1` swaps in a deterministic mock model so you can learn
  the framework without credentials.

## Create and run an agent

```sh
npm create aster@latest my-agent    # or: npx aster init my-agent
cd my-agent
npm install
npx aster dev
```

On a TTY, `init` asks for your provider (Anthropic, OpenAI, an
OpenAI-compatible endpoint like Ollama, or offline), model, and a starting
preset — then writes a `.env` that `dev` and `run` load automatically. In
scripts or CI, pass `--yes` and flags instead; see
[Customization](./customization.md).

`aster dev` gives you, in one process:

- an interactive chat in your terminal (streaming)
- the built-in HTTP channel on port 3111
- hot reload — edit any file under `agent/` and the next message uses it
- schedules running on their cron expressions
- `/approve` and `/deny` for human-in-the-loop tool calls

## Your first change

Replace `agent/instructions.md`:

```markdown
You are a pirate-themed assistant. Answer every question, but in character.
```

Send another message — the reload is automatic.

## Your first tool

Create `agent/tools/roll_dice.ts`:

```ts
import { defineTool } from "aster/tools";
import { z } from "zod";

export default defineTool({
  description: "Roll N six-sided dice.",
  inputSchema: z.object({ count: z.number().int().min(1).max(20) }),
  execute({ count }) {
    return { rolls: Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6)) };
  },
});
```

That's the whole integration: the filename is the tool name, the zod schema
validates what the model sends, and the return value goes back to the model.

> **Tip**
> `npx aster inspect project` shows exactly what the framework discovered —
> use it whenever a file doesn't seem to be picked up.

## Ship it

```sh
npx aster build     # release gate: loads everything, checks schemas, cron, types
npx aster deploy    # writes dist-deploy/ with a Dockerfile and start script
```

## Next steps

- [Project structure](./project-structure.md) — every convention in one place
- [Sessions & durability](./sessions-and-durability.md) — what makes runs resumable
