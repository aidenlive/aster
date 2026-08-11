import { parseCron } from "./cron.js";

export interface ScheduleContext {
  /** Send a prompt to the agent in a dedicated session and await the result. */
  prompt(text: string, options?: { sessionId?: string }): Promise<string>;
  log: (message: string, fields?: Record<string, unknown>) => void;
  now: Date;
}

export interface ScheduleDefinition {
  name?: string;
  description?: string;
  /** Five-field cron expression, local time. */
  cron: string;
  run(ctx: ScheduleContext): Promise<void> | void;
}

export interface Schedule extends ScheduleDefinition {
  name: string;
  sourcePath?: string;
}

const MARKER = Symbol.for("aster.schedule");

export function defineSchedule(definition: ScheduleDefinition): ScheduleDefinition {
  parseCron(definition.cron); // fail fast on invalid expressions
  Object.defineProperty(definition, MARKER, { value: true, enumerable: false });
  return definition;
}

export function isScheduleDefinition(value: unknown): value is ScheduleDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (MARKER in value ||
      (typeof (value as ScheduleDefinition).run === "function" &&
        typeof (value as ScheduleDefinition).cron === "string"))
  );
}
