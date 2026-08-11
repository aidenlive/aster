import { mkdirSync, existsSync } from "node:fs";
import { appendFile, readFile, writeFile, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { AsterError } from "../errors.js";
import type { EventRecord } from "./events.js";

/**
 * Durable storage interface. The default implementation writes to the local
 * filesystem under `.aster/`. Alternative stores (SQLite, Postgres, object
 * storage) implement the same interface and are configured in `agent.ts`.
 */
export interface SessionStore {
  appendEvent(sessionId: string, record: EventRecord): Promise<void>;
  readEvents(sessionId: string): Promise<EventRecord[]>;
  readState(sessionId: string): Promise<Record<string, unknown>>;
  writeState(sessionId: string, state: Record<string, unknown>): Promise<void>;
  listSessions(): Promise<Array<{ id: string; updatedAt: string }>>;
  sessionExists(sessionId: string): Promise<boolean>;
}

export class FileSessionStore implements SessionStore {
  constructor(private readonly rootDir: string) {}

  private dir(sessionId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      throw new AsterError("SESSION_NOT_FOUND", `Invalid session id "${sessionId}"`);
    }
    return join(this.rootDir, "sessions", sessionId);
  }

  private ensure(sessionId: string): string {
    const dir = this.dir(sessionId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  async appendEvent(sessionId: string, record: EventRecord): Promise<void> {
    const dir = this.ensure(sessionId);
    await appendFile(join(dir, "events.jsonl"), JSON.stringify(record) + "\n", "utf8");
  }

  async readEvents(sessionId: string): Promise<EventRecord[]> {
    const path = join(this.dir(sessionId), "events.jsonl");
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      return [];
    }
    const records: EventRecord[] = [];
    for (const [index, line] of raw.split("\n").entries()) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as EventRecord);
      } catch {
        // A torn final line can occur after a crash mid-append. Tolerate a
        // truncated last line; anything earlier means real corruption.
        const remaining = raw.split("\n").slice(index + 1).some((l) => l.trim());
        if (remaining) {
          throw new AsterError("SESSION_CORRUPT", `Corrupt event log for session ${sessionId} at line ${index + 1}`);
        }
      }
    }
    return records;
  }

  async readState(sessionId: string): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(join(this.dir(sessionId), "state.json"), "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async writeState(sessionId: string, state: Record<string, unknown>): Promise<void> {
    const dir = this.ensure(sessionId);
    const tmp = join(dir, `state.json.tmp-${process.pid}`);
    await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await rename(tmp, join(dir, "state.json")); // atomic on POSIX
  }

  async listSessions(): Promise<Array<{ id: string; updatedAt: string }>> {
    const dir = join(this.rootDir, "sessions");
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const sessions: Array<{ id: string; updatedAt: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const { stat } = await import("node:fs/promises");
        const info = await stat(join(dir, entry.name, "events.jsonl"));
        sessions.push({ id: entry.name, updatedAt: info.mtime.toISOString() });
      } catch {
        sessions.push({ id: entry.name, updatedAt: "" });
      }
    }
    return sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    return existsSync(join(this.dir(sessionId), "events.jsonl"));
  }
}
