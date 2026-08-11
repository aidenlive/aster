import { eventId } from "../ids.js";
import type { Message, PendingApproval } from "../types.js";
import { EventBus, type EventListener, type EventRecord, type SessionEvent } from "./events.js";
import type { SessionStore } from "./store.js";

export type SessionStatus = "idle" | "running" | "waiting_approval" | "failed";

/**
 * A Session is the durable unit of an agent's life: an append-only event log
 * plus a small JSON state document. The transcript and pending approvals are
 * projections of the log, so a session can always be resumed after a crash,
 * a restart, or a deploy by replaying events.
 */
export class Session {
  private seq = 0;
  private transcript: Message[] = [];
  private pending = new Map<string, PendingApproval>();
  private statusValue: SessionStatus = "idle";
  readonly bus = new EventBus();

  private constructor(
    readonly id: string,
    private readonly store: SessionStore,
  ) {}

  /** Open (or create) a session and replay its event log. */
  static async open(id: string, store: SessionStore): Promise<Session> {
    const session = new Session(id, store);
    const records = await store.readEvents(id);
    for (const record of records) {
      session.seq = Math.max(session.seq, record.seq);
      session.apply(record.event);
    }
    if (session.statusValue === "running") {
      // A crash mid-run leaves the log without run.finished; recover as idle
      // unless approvals are outstanding.
      session.statusValue = session.pending.size > 0 ? "waiting_approval" : "idle";
    }
    return session;
  }

  get status(): SessionStatus {
    return this.statusValue;
  }

  get messages(): readonly Message[] {
    return this.transcript;
  }

  get pendingApprovals(): PendingApproval[] {
    return [...this.pending.values()];
  }

  onEvent(listener: EventListener): () => void {
    return this.bus.on(listener);
  }

  /** Append an event durably, update projections, and notify listeners. */
  async emit(event: SessionEvent): Promise<EventRecord> {
    const record: EventRecord = {
      id: eventId(),
      time: new Date().toISOString(),
      seq: ++this.seq,
      event,
    };
    await this.store.appendEvent(this.id, record);
    this.apply(event);
    this.bus.emit(record);
    return record;
  }

  private apply(event: SessionEvent): void {
    switch (event.type) {
      case "message.appended":
        this.transcript.push(event.message);
        break;
      case "approval.requested":
        this.pending.set(event.approval.toolCallId, event.approval);
        this.statusValue = "waiting_approval";
        break;
      case "approval.resolved":
        this.pending.delete(event.toolCallId);
        break;
      case "run.started":
        this.statusValue = "running";
        break;
      case "run.finished":
        this.statusValue =
          event.status === "waiting_approval"
            ? "waiting_approval"
            : event.status === "failed"
              ? "failed"
              : "idle";
        break;
      default:
        break;
    }
  }

  /** Durable per-session key/value state (also used for workflow step memoization). */
  async getState<T = unknown>(key: string): Promise<T | undefined> {
    const state = await this.store.readState(this.id);
    return state[key] as T | undefined;
  }

  async setState(key: string, value: unknown): Promise<void> {
    const state = await this.store.readState(this.id);
    state[key] = value;
    await this.store.writeState(this.id, state);
  }

  async readAllState(): Promise<Record<string, unknown>> {
    return this.store.readState(this.id);
  }

  async events(): Promise<EventRecord[]> {
    return this.store.readEvents(this.id);
  }
}
