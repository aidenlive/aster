import type { EventRecord } from "../runtime/events.js";

/**
 * Traces are a projection of the session event log — nothing is recorded
 * twice. Each model call and tool call becomes a span with duration and
 * status, grouped under its run.
 */

export interface TraceSpan {
  spanId: string;
  kind: "model" | "tool";
  name: string;
  startedAt: string;
  durationMs?: number;
  status: "ok" | "error" | "open";
  detail?: Record<string, unknown>;
}

export interface RunTrace {
  runId: string;
  trigger: string;
  startedAt: string;
  status: string;
  spans: TraceSpan[];
  usage: { inputTokens: number; outputTokens: number };
}

export function buildTraces(records: EventRecord[]): RunTrace[] {
  const runs: RunTrace[] = [];
  let current: RunTrace | undefined;
  const openSpans = new Map<string, TraceSpan>();

  for (const record of records) {
    const event = record.event;
    switch (event.type) {
      case "run.started":
        current = {
          runId: event.runId,
          trigger: event.trigger,
          startedAt: record.time,
          status: "running",
          spans: [],
          usage: { inputTokens: 0, outputTokens: 0 },
        };
        runs.push(current);
        break;
      case "run.finished":
        if (current && current.runId === event.runId) current.status = event.status;
        break;
      case "model.request": {
        const span: TraceSpan = {
          spanId: event.spanId,
          kind: "model",
          name: event.model,
          startedAt: record.time,
          status: "open",
          detail: { messageCount: event.messageCount },
        };
        openSpans.set(event.spanId, span);
        current?.spans.push(span);
        break;
      }
      case "model.response": {
        const span = openSpans.get(event.spanId);
        if (span) {
          span.durationMs = event.durationMs;
          span.status = "ok";
          span.detail = { ...span.detail, stopReason: event.stopReason, usage: event.usage };
          openSpans.delete(event.spanId);
        }
        if (current) {
          current.usage.inputTokens += event.usage.inputTokens ?? 0;
          current.usage.outputTokens += event.usage.outputTokens ?? 0;
        }
        break;
      }
      case "tool.call": {
        const span: TraceSpan = {
          spanId: event.spanId,
          kind: "tool",
          name: event.tool,
          startedAt: record.time,
          status: "open",
          detail: { input: event.input },
        };
        openSpans.set(event.spanId, span);
        current?.spans.push(span);
        break;
      }
      case "tool.result": {
        const span = openSpans.get(event.spanId);
        if (span) {
          span.durationMs = event.durationMs;
          span.status = event.isError ? "error" : "ok";
          span.detail = { ...span.detail, output: event.output };
          openSpans.delete(event.spanId);
        }
        break;
      }
      default:
        break;
    }
  }
  return runs;
}
