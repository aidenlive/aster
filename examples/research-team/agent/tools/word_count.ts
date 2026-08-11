import { defineTool } from "aster/tools";
import { z } from "zod";

/** Runs in an isolated child process: no env secrets, crash-safe. */
export default defineTool({
  description: "Count words and estimate reading time for a text.",
  isolation: "process",
  inputSchema: z.object({ text: z.string() }),
  execute({ text }) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { words, readingMinutes: Math.max(1, Math.round(words / 200)) };
  },
});
