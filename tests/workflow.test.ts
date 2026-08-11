import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Session } from "../src/runtime/session.js";
import { FileSessionStore } from "../src/runtime/store.js";
import { executeWorkflow, type Workflow } from "../src/workflows/workflow.js";

describe("durable workflows", () => {
  it("memoizes completed steps across re-execution", async () => {
    const store = new FileSessionStore(mkdtempSync(join(tmpdir(), "aster-wf-")));
    let sideEffects = 0;
    let failSecond = true;

    const workflow: Workflow<{ n: number }, number> = {
      name: "double_then_inc",
      async run(ctx) {
        const doubled = await ctx.step("double", () => {
          sideEffects++;
          return ctx.input.n * 2;
        });
        const final = await ctx.step("inc", () => {
          if (failSecond) throw new Error("transient failure");
          sideEffects++;
          return doubled + 1;
        });
        return final;
      },
    };

    const helpers = { prompt: async () => "", log: () => {} };
    const session1 = await Session.open("wf1", store);
    await expect(executeWorkflow(workflow, { n: 5 }, session1, helpers)).rejects.toThrow("transient");
    expect(sideEffects).toBe(1);

    failSecond = false;
    const session2 = await Session.open("wf1", store); // simulate restart
    const result = await executeWorkflow(workflow, { n: 5 }, session2, helpers);
    expect(result).toBe(11);
    expect(sideEffects).toBe(2); // "double" replayed from state, not re-run
  });
});
