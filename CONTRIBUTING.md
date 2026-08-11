# Contributing to aster

Thanks for helping. The bar for changes is simple: keep the core small, keep
every behavior tested, and keep the docs true.

## Getting the repo running

```sh
git clone <repo> && cd aster
npm install
npm test            # vitest — must be green before and after your change
npm run typecheck   # strict tsc over src/
npm run build       # emits dist/ and verifies package contents
```

Node ≥ 22.18 is required (native TypeScript type stripping).

## Trying your changes against a real project

```sh
npm run build
node dist/cli/main.js init /tmp/play
cd /tmp/play && mkdir -p node_modules && ln -s <repo> node_modules/aster && ln -s <repo>/node_modules/zod node_modules/zod
ASTER_OFFLINE=1 node <repo>/dist/cli/main.js dev
```

`ASTER_OFFLINE=1` exercises everything except real provider wire formats.

## Ground rules

- **Small core.** New runtime dependencies need a strong justification;
  prefer ~100 lines of owned code over a package when reasonable.
- **Events first.** Anything observable the runtime does should be an event
  in the session log, not a side channel.
- **Interfaces over integrations.** Cloud- or vendor-specific behavior
  belongs behind `Provider`, `SessionStore`, or `defineChannel`, not in core.
- **Tests travel with behavior.** A change to what the framework *does* ships
  with a test that fails without it; a change to conventions ships with a
  docs update in the same PR.
- **Honest limitations.** If your change has a known edge, record it in
  `docs/architecture.md` under trade-offs rather than leaving it implicit.

## Project layout

See [docs/architecture.md](./docs/architecture.md) for module boundaries. The
short version: `src/cli` presents, `src/agent` orchestrates, everything else
defines one concern behind one interface.

## Reporting issues

Include your Node version, the output of `aster inspect project`, and — for
runtime issues — the relevant `.aster/sessions/<id>/events.jsonl` (redact
anything sensitive; it contains full tool inputs and outputs).
