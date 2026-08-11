# Workflows

> **TL;DR**
> A workflow is ordinary async code whose side-effectful units are wrapped in
> `ctx.step(name, fn)`. Completed steps are memoized in durable session state,
> so re-running after a crash resumes instead of repeating.

## Writing one

`agent/workflows/onboard_customer.ts`:

```ts
import { defineWorkflow } from "aster/workflows";

export default defineWorkflow<{ email: string }, { accountId: string }>({
  description: "Provision a new customer end to end.",
  async run(ctx) {
    const accountId = await ctx.step("create_account", () =>
      createAccount(ctx.input.email),
    );
    const summary = await ctx.step("welcome_copy", () =>
      ctx.prompt(`Write a two-line welcome for ${ctx.input.email}`),
    );
    await ctx.step("send_email", () => sendEmail(ctx.input.email, summary));
    return { accountId };
  },
});
```

Run it:

```sh
aster run --workflow onboard_customer --input '{"email":"a@b.co"}'
# or resume a specific session after a failure:
aster run --workflow onboard_customer --input '{"email":"a@b.co"}' --session wf-retry-1
```

## The durability contract

- Each `ctx.step` result is written to the session's durable state **before**
  the next step runs.
- Re-executing the workflow in the same session replays completed steps from
  state — `fn` is not called again — and continues from the first incomplete
  step.
- A step that throws leaves no record; it re-runs on the next attempt.

> **Important**
> Two consequences follow. (1) Step names must be unique and stable — renaming
> a step orphans its record. (2) Code *between* steps runs on every attempt,
> so side effects belong inside steps. This is the same discipline as any
> event-sourced/temporal-style system, kept deliberately small.

## When to use a workflow vs. the loop

| Situation | Use |
| --------- | --- |
| The model should decide the path (open-ended request) | The agent loop — just send a message. |
| The path is fixed and must complete exactly once per step (billing, provisioning, publishing) | A workflow. |
| Fixed path that includes model judgment | A workflow whose steps call `ctx.prompt(...)`. |
