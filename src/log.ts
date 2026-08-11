/**
 * Structured logger. Human-readable to stderr by default; JSON lines with
 * ASTER_LOG_FORMAT=json. Level via ASTER_LOG_LEVEL (debug|info|warn|error).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  level: LogLevel;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function resolveLevel(): LogLevel {
  const raw = process.env.ASTER_LOG_LEVEL;
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

function write(level: LogLevel, msg: string, fields: Record<string, unknown>): void {
  if (process.env.ASTER_LOG_FORMAT === "json") {
    process.stderr.write(
      JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }) + "\n",
    );
    return;
  }
  const extra = Object.keys(fields).length ? " " + JSON.stringify(fields) : "";
  process.stderr.write(`[aster:${level}] ${msg}${extra}\n`);
}

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  const level = resolveLevel();
  const emit = (l: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVELS[l] >= LEVELS[level]) write(l, msg, { ...bindings, ...fields });
  };
  return {
    level,
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

export const log: Logger = createLogger();
