import { AsterError } from "../errors.js";

/**
 * Minimal five-field cron parser: minute hour day-of-month month day-of-week.
 * Supports "*", lists ("1,15"), ranges ("1-5"), and steps ("*&#47;5", "10-30/5").
 * Day-of-month and day-of-week combine with OR when both are restricted,
 * matching Vixie cron semantics.
 */

interface CronField {
  values: Set<number>;
  restricted: boolean;
}

export interface CronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
  source: string;
}

const RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

export function parseCron(expression: string): CronExpression {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new AsterError("SCHEDULE_INVALID", `Cron "${expression}" must have 5 fields (minute hour dom month dow)`);
  }
  const parsed = fields.map((field, i) => parseField(field, RANGES[i]![0], RANGES[i]![1], expression));
  return {
    minute: parsed[0]!,
    hour: parsed[1]!,
    dayOfMonth: parsed[2]!,
    month: parsed[3]!,
    dayOfWeek: parsed[4]!,
    source: expression.trim(),
  };
}

function parseField(field: string, min: number, max: number, source: string): CronField {
  const values = new Set<number>();
  let restricted = true;
  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const base = stepMatch ? stepMatch[1]! : part;
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    if (step < 1) throw new AsterError("SCHEDULE_INVALID", `Invalid step in cron "${source}"`);
    let lo: number;
    let hi: number;
    if (base === "*") {
      lo = min;
      hi = max;
      if (!stepMatch && field === "*") restricted = false;
    } else if (/^\d+$/.test(base)) {
      lo = hi = Number(base);
      if (stepMatch) hi = max;
    } else {
      const range = base.match(/^(\d+)-(\d+)$/);
      if (!range) throw new AsterError("SCHEDULE_INVALID", `Invalid cron field "${part}" in "${source}"`);
      lo = Number(range[1]);
      hi = Number(range[2]);
    }
    if (lo < min || hi > max || lo > hi) {
      throw new AsterError("SCHEDULE_INVALID", `Cron field "${part}" out of range [${min},${max}] in "${source}"`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { values, restricted };
}

export function cronMatches(cron: CronExpression, date: Date): boolean {
  const domRestricted = cron.dayOfMonth.restricted;
  const dowRestricted = cron.dayOfWeek.restricted;
  const domMatch = cron.dayOfMonth.values.has(date.getDate());
  const dowMatch = cron.dayOfWeek.values.has(date.getDay());
  const dayMatch =
    domRestricted && dowRestricted ? domMatch || dowMatch : domMatch && dowMatch;
  return (
    cron.minute.values.has(date.getMinutes()) &&
    cron.hour.values.has(date.getHours()) &&
    cron.month.values.has(date.getMonth() + 1) &&
    dayMatch
  );
}

/** Next matching time strictly after `from`. Scans minute-by-minute, capped at 4 years. */
export function nextRun(cron: CronExpression, from: Date = new Date()): Date {
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = from.getTime() + 4 * 366 * 24 * 60 * 60 * 1000;
  while (cursor.getTime() < limit) {
    if (cronMatches(cron, cursor)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  throw new AsterError("SCHEDULE_INVALID", `Cron "${cron.source}" never matches`);
}
