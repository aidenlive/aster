# Deployment

> **TL;DR**
> `aster build` is the release gate; `aster deploy` writes a self-contained
> bundle with a Dockerfile. Production is `aster run --serve` plus persistent
> `.aster/` storage and provider credentials.

## The release gate

```sh
aster build            # human output
aster build --json     # CI output; exit code is the verdict
```

| Check | Catches |
| ----- | ------- |
| `load` | Missing files, invalid exports, bad names, duplicate tools. |
| `tool-schemas` | Zod schemas that cannot convert to JSON Schema. |
| `schedules` | Invalid cron expressions, schedules that never fire. |
| `typecheck` | `tsc --noEmit`, when the project has a `tsconfig.json`. |

## The bundle

```sh
aster deploy           # → dist-deploy/
```

`dist-deploy/` contains the `agent/` directory, manifests, a `Dockerfile`, a
`start.sh`, and `DEPLOY.md` with exact commands. It runs anywhere Node ≥ 22.18
or a container runs:

```sh
docker build -t my-agent dist-deploy
docker run -e ANTHROPIC_API_KEY=... -p 3111:3111 -v aster-data:/app/.aster my-agent
```

## Production checklist

- [ ] `aster build` passes in CI
- [ ] Provider keys supplied via the environment (never committed)
- [ ] `.aster/` on a persistent volume — it is the agent's memory
- [ ] One runtime instance per `.aster/` directory (see storage note in
      [Sessions & durability](./sessions-and-durability.md))
- [ ] `approval: true` on every tool with irreversible effects, and something
      watching for `waiting_approval` sessions
- [ ] `ASTER_SANDBOX_ENV` reviewed if sandboxed tools need any environment

> **Warning**
> The HTTP channel ships without authentication — it is a local/dev interface
> and an internal service surface. Put it behind your gateway or add auth in a
> custom channel before exposing it publicly.

## Serverless & platforms

The runtime is a plain Node process with filesystem state, so anything that
runs containers works today. Platform adapters (durable stores + triggers for
Vercel/Lambda-style hosts) are an intended extension point via the
`SessionStore` interface rather than built-in cloud coupling.
