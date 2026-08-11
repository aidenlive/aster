import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Session } from "../src/runtime/session.js";
import { FileSessionStore } from "../src/runtime/store.js";
import { userMessage } from "../src/types.js";

describe("durable sessions", () => {
  it("replays transcript and state after reopening", async () => {
    const store = new FileSessionStore(mkdtempSync(join(tmpdir(), "aster-")));
    const a = await Session.open("s1", store);
    await a.emit({ type: "session.created", sessionId: "s1", agent: "t" });
    await a.emit({ type: "message.appended", message: userMessage("hello") });
    await a.setState("k", { n: 1 });

    const b = await Session.open("s1", store);
    expect(b.messages).toHaveLength(1);
    expect(await b.getState("k")).toEqual({ n: 1 });
  });

  it("restores waiting_approval status from the log", async () => {
    const store = new FileSessionStore(mkdtempSync(join(tmpdir(), "aster-")));
    const a = await Session.open("s2", store);
    await a.emit({
      type: "approval.requested",
      approval: { toolCallId: "c1", tool: "danger", input: {}, requestedAt: new Date().toISOString() },
    });
    const b = await Session.open("s2", store);
    expect(b.status).toBe("waiting_approval");
    expect(b.pendingApprovals).toHaveLength(1);
  });

  it("tolerates a torn final line after a crash", async () => {
    const root = mkdtempSync(join(tmpdir(), "aster-"));
    const store = new FileSessionStore(root);
    const a = await Session.open("s3", store);
    await a.emit({ type: "session.created", sessionId: "s3", agent: "t" });
    const { appendFileSync } = await import("node:fs");
    appendFileSync(join(root, "sessions", "s3", "events.jsonl"), '{"id":"evt_torn","time"');
    const b = await Session.open("s3", store);
    expect((await b.events()).length).toBe(1);
  });

  it("rejects path-traversal session ids", async () => {
    const store = new FileSessionStore(mkdtempSync(join(tmpdir(), "aster-")));
    await expect(Session.open("../evil", store)).rejects.toThrow();
  });
});
