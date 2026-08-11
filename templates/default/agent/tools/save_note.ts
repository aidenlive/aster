import { defineTool } from "aster/tools";
import { z } from "zod";

/**
 * Demonstrates two aster features:
 *  - durable session state (`ctx.state`) that survives restarts
 *  - human-in-the-loop: `approval: true` pauses the run until a human
 *    approves the call (/approve in `aster dev`).
 */
export default defineTool({
  description: "Save a note into durable session state. Requires human approval.",
  approval: true,
  inputSchema: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
  }),
  async execute({ title, body }, ctx) {
    const notes = (await ctx.state.get<Record<string, string>>("notes")) ?? {};
    notes[title] = body;
    await ctx.state.set("notes", notes);
    return { saved: true, count: Object.keys(notes).length };
  },
});
