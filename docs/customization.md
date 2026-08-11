# Customization & white-labeling

> **TL;DR**
> Brand your *agent* freely — that is per-project and needs nothing special.
> Configure your *setup* (provider, endpoint, presets) through `aster init`.
> Renaming the *framework* is a supported way to fork, with the trade-offs
> stated up front.

## Three layers, three answers

| You want to… | Do this | Upgrade path |
| ------------ | ------- | ------------ |
| Brand the agent (name, personality, endpoints, UI) | Edit your project: `package.json` name, `instructions.md`, channels | Unaffected |
| Use your own models / gateway | `aster init` provider options, or edit `agent/agent.ts` | Unaffected |
| White-label the framework itself | `scripts/rebrand.mjs` — a deliberate fork | **Ends** — see below |

## Configuring your setup

`aster init` is interactive on a TTY and asks for the provider (Anthropic,
OpenAI, an OpenAI-compatible endpoint such as Ollama/vLLM/a corporate
gateway, or offline), the model, and a starting preset (`minimal`,
`standard`, `team`). It writes a `.env` — loaded automatically by `dev` and
`run`, never overriding real environment variables — and an `agent/agent.ts`
matching your choices. Every prompt has a flag for scripts and CI:

```sh
npm create aster@latest my-agent            # same flow via the npm-create convention
aster init my-agent --yes --provider compatible \
  --base-url http://localhost:11434 --model local/llama3.3 --preset team
```

Existing customization carries over untouched: aster only reads the
conventional `agent/` layout, so wrapping current prompts, tools, or model
gateways is a matter of placing files, not porting them.

## Renaming the framework (forking)

Some platform teams want the framework itself to carry an internal name. That
is a fork, and the repository ships a clean way to do it:

```sh
node scripts/rebrand.mjs --name nimbus --i-am-forking --verify
```

This rewrites the package and bin name, every import specifier
(`aster/tools` → `nimbus/tools`), CLI strings, the env-var prefix
(`ASTER_` → `NIMBUS_`), the state directory (`.aster/` → `.nimbus/`), the
`create-*` wrapper, templates, examples, docs, and tests — then `--verify`
runs the full test suite under the new name to prove the rename is complete.
`--dry-run` previews the change.

> **Warning**
> A renamed install is a hard fork. `npm update` can no longer deliver
> upstream fixes or security patches, public documentation stops matching
> your import paths, and every future upstream merge is yours to do. The
> script refuses to run without `--i-am-forking` so this trade-off is
> accepted explicitly. If you are unsure whether you need this: you don't —
> brand the agent, not the framework.

Existing session data survives a rename by moving the directory:
`mv .aster .nimbus`.
