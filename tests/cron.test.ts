import { describe, expect, it } from "vitest";
import { cronMatches, nextRun, parseCron } from "../src/schedules/cron.js";

describe("cron", () => {
  it("parses and matches simple expressions", () => {
    const cron = parseCron("30 9 * * 1-5");
    expect(cronMatches(cron, new Date(2026, 7, 10, 9, 30))).toBe(true); // Monday
    expect(cronMatches(cron, new Date(2026, 7, 10, 9, 31))).toBe(false);
    expect(cronMatches(cron, new Date(2026, 7, 9, 9, 30))).toBe(false); // Sunday
  });

  it("supports steps and lists", () => {
    const cron = parseCron("*/15 0,12 1 * *");
    expect(cron.minute.values).toEqual(new Set([0, 15, 30, 45]));
    expect(cron.hour.values).toEqual(new Set([0, 12]));
  });

  it("uses OR semantics when both dom and dow are restricted", () => {
    const cron = parseCron("0 0 13 * 5"); // 13th OR Friday
    expect(cronMatches(cron, new Date(2026, 7, 13, 0, 0))).toBe(true); // 13th (Thursday)
    expect(cronMatches(cron, new Date(2026, 7, 14, 0, 0))).toBe(true); // Friday the 14th
    expect(cronMatches(cron, new Date(2026, 7, 15, 0, 0))).toBe(false);
  });

  it("computes the next run strictly after now", () => {
    const cron = parseCron("0 * * * *");
    const next = nextRun(cron, new Date(2026, 0, 1, 5, 0, 0));
    expect(next.getHours()).toBe(6);
    expect(next.getMinutes()).toBe(0);
  });

  it("rejects invalid expressions", () => {
    expect(() => parseCron("* * *")).toThrow();
    expect(() => parseCron("61 * * * *")).toThrow();
    expect(() => parseCron("a * * * *")).toThrow();
  });
});
