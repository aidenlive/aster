import { defineWorkflow } from "aster/workflows";

/**
 * Durable workflow: research → draft → measure. Each ctx.step() is memoized
 * in session state, so a crash between steps resumes without repeating work.
 */
export default defineWorkflow<{ topic: string }, { brief: string; words: number }>({
  description: "Produce a daily brief on a topic via the subagent team.",
  async run(ctx) {
    const findings = await ctx.step("research", () =>
      ctx.prompt(`Use the researcher subagent to gather findings on: ${ctx.input.topic}`),
    );
    const brief = await ctx.step("draft", () =>
      ctx.prompt(`Use the writer subagent to draft a brief from these findings:\n${findings}`),
    );
    const measured = await ctx.step("measure", () =>
      ctx.prompt(`Use the word_count tool on this text and report the numbers:\n${brief}`),
    );
    ctx.log("brief complete", { topic: ctx.input.topic });
    return { brief, words: measured.length };
  },
});
