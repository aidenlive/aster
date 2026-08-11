import { defineTool } from "aster/tools";
import { z } from "zod";

export default defineTool({
  description: "Get the current date and time, optionally in a specific IANA timezone.",
  inputSchema: z.object({
    timezone: z.string().optional().describe('IANA timezone, e.g. "Europe/Paris"'),
  }),
  execute({ timezone }) {
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: now.toLocaleString("en-US", timezone ? { timeZone: timezone } : undefined),
      timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
});
