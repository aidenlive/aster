import { createLogger } from "../log.js";
import { serializeError } from "../errors.js";
import { parseCron, nextRun, type CronExpression } from "./cron.js";
import type { Schedule, ScheduleContext } from "./define.js";

const log = createLogger({ component: "scheduler" });

/**
 * In-process scheduler used by `aster dev` and `aster run --serve`.
 * Ticks once per minute; overlapping runs of the same schedule are skipped.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | undefined;
  private readonly running = new Set<string>();
  private readonly compiled: Array<{ schedule: Schedule; cron: CronExpression }>;

  constructor(
    schedules: Schedule[],
    private readonly makeContext: (schedule: Schedule, now: Date) => ScheduleContext,
  ) {
    this.compiled = schedules.map((schedule) => ({ schedule, cron: parseCron(schedule.cron) }));
  }

  start(): void {
    if (this.timer) return;
    const tick = () => void this.tick(new Date());
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    this.timer = setTimeout(() => {
      tick();
      this.timer = setInterval(tick, 60_000);
    }, msToNextMinute);
    for (const { schedule, cron } of this.compiled) {
      log.info(`schedule "${schedule.name}" registered`, {
        cron: schedule.cron,
        next: nextRun(cron).toISOString(),
      });
    }
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Exposed for tests and `aster run --schedule <name>`. */
  async tick(now: Date): Promise<void> {
    for (const { schedule, cron } of this.compiled) {
      if (!matches(cron, now) || this.running.has(schedule.name)) continue;
      this.running.add(schedule.name);
      try {
        await schedule.run(this.makeContext(schedule, now));
      } catch (error) {
        log.error(`schedule "${schedule.name}" failed`, serializeError(error));
      } finally {
        this.running.delete(schedule.name);
      }
    }
  }

  async runByName(name: string, now = new Date()): Promise<boolean> {
    const entry = this.compiled.find((c) => c.schedule.name === name);
    if (!entry) return false;
    await entry.schedule.run(this.makeContext(entry.schedule, now));
    return true;
  }

  list(): Array<{ name: string; cron: string; next: string }> {
    return this.compiled.map(({ schedule, cron }) => ({
      name: schedule.name,
      cron: schedule.cron,
      next: nextRun(cron).toISOString(),
    }));
  }
}

import { cronMatches } from "./cron.js";
function matches(cron: CronExpression, now: Date): boolean {
  return cronMatches(cron, now);
}
