import type { Message, PendingApproval } from "../types.js";

/**
 * Every observable thing that happens in a session is an event. Events are the
 * single source of truth: the transcript, pending approvals, workflow step
 * memoization, and traces are all derived from the append-only event log.
 */
export type SessionEvent =
  | { type: "session.created"; sessionId: string; agent: string }
  | { type: "message.appended"; message: Message }
  | { type: "model.request"; model: string; spanId: string; messageCount: number }
  | {
      type: "model.response";
      spanId: string;
      stopReason: string;
      usage: { inputTokens?: number; outputTokens?: number };
      durationMs: number;
    }
  | { type: "tool.call"; spanId: string; toolCallId: string; tool: string; input: unknown }
  | {
      type: "tool.result";
      spanId: string;
      toolCallId: string;
      tool: string;
      output: unknown;
      isError: boolean;
      durationMs: number;
    }
  | { type: "approval.requested"; approval: PendingApproval }
  | { type: "approval.resolved"; toolCallId: string; approved: boolean; by?: string }
  | { type: "step.completed"; step: string; result: unknown }
  | { type: "run.started"; runId: string; trigger: "message" | "schedule" | "channel" | "resume" }
  | {
      type: "run.finished";
      runId: string;
      status: "completed" | "waiting_approval" | "failed" | "max_steps";
      error?: { message: string; code?: string };
    }
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string; fields?: Record<string, unknown> };

export interface EventRecord {
  id: string;
  time: string;
  seq: number;
  event: SessionEvent;
}

export type EventListener = (record: EventRecord) => void;

export class EventBus {
  private readonly listeners = new Set<EventListener>();

  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(record: EventRecord): void {
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch {
        // Listeners must not break the run loop.
      }
    }
  }
}
