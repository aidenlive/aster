# Working on aster (notes for coding agents)

- Read `docs/architecture.md` before changing `src/agent` or `src/runtime`;
  module boundaries there are normative.
- Run `npm test && npm run typecheck` before claiming a change works. The
  offline flow for end-to-end checks is in CONTRIBUTING.md.
- The session event log is the source of truth. Never add parallel state that
  the log cannot reconstruct.
- User-facing conventions (file locations, names, CLI flags) are documented in
  `docs/`; a behavior change without the matching doc edit is incomplete.
- Keep runtime dependencies at exactly: zod.
