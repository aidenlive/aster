import { defineSchedule } from "aster/schedules";

export default defineSchedule({
  description: "Weekday 8am brief on the standing topic.",
  cron: "0 8 * * 1-5",
  async run(ctx) {
    const output = await ctx.prompt("Produce this morning's brief on renewable energy.");
    ctx.log("morning brief produced", { chars: output.length });
  },
});
