/** Framework error hierarchy. Every error carries a stable machine-readable code. */

export type AsterErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_INVALID"
  | "MODULE_LOAD_FAILED"
  | "TOOL_NOT_FOUND"
  | "TOOL_INPUT_INVALID"
  | "TOOL_EXECUTION_FAILED"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_ERROR"
  | "SESSION_NOT_FOUND"
  | "SESSION_CORRUPT"
  | "APPROVAL_NOT_FOUND"
  | "SCHEDULE_INVALID"
  | "SANDBOX_FAILED"
  | "CONFIG_INVALID";

export class AsterError extends Error {
  readonly code: AsterErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AsterErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AsterError";
    this.code = code;
    this.details = details;
  }
}

export function isAsterError(value: unknown): value is AsterError {
  return value instanceof AsterError;
}

/** Normalize any thrown value into a serializable error shape for event logs. */
export function serializeError(value: unknown): {
  message: string;
  code?: string;
  stack?: string;
} {
  if (isAsterError(value)) {
    return { message: value.message, code: value.code, stack: value.stack };
  }
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack };
  }
  return { message: String(value) };
}
