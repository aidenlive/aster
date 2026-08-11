# Changelog

## 0.1.0

Initial release.

- Filesystem-first project model: `instructions.md`, `tools/`, `skills/`,
  `subagents/`, `workflows/`, `channels/`, `schedules/`, discovered
  automatically; TypeScript loaded natively (Node ≥ 22.18).
- Durable runtime: append-only per-session event log with replay; atomic
  state writes; crash-tolerant log reading.
- Agentic loop with typed tools (zod-validated), error results fed back to
  the model, step caps, and per-tool timeouts.
- Human-in-the-loop: `approval: true` tools pause runs durably; approve/deny
  across restarts.
- Skills with progressive disclosure via the built-in `use_skill` tool.
- Subagents as delegation tools running traced child sessions, with private
  tools and per-subagent models.
- Durable workflows with memoized `ctx.step`.
- Providers: Anthropic, OpenAI(-compatible), deterministic offline mock;
  `<provider>/<model>` routing; retry with backoff.
- Channels: built-in HTTP with SSE streaming; `defineChannel` for custom
  integrations. Schedules: five-field cron with overlap protection.
- Process-isolation option for tools with environment scrubbing and timeouts.
- CLI: `init`, `dev` (chat + server + hot reload + approvals), `run`
  (prompt/workflow/schedule/serve), `build` (release gate), `inspect`
  (project/sessions/session/trace, all `--json`), `deploy` (Docker-ready
  bundle).
- Onboarding: interactive `init` (provider incl. OpenAI-compatible
  endpoints, model, presets minimal/standard/team) writing `.env` +
  `agent/agent.ts`; `.env` auto-loaded by `dev`/`run`; `create-aster`
  scaffolder package; `scripts/rebrand.mjs` for explicit, test-verified
  white-label forks.
- 42 tests, two worked examples, full documentation set.
