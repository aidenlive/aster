import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestAgent } from "../src/testing/index.js";
import type { Tool } from "../src/tools/define.js";

const addTool: Tool = {
  name: "add",
  description: "Add two numbers",
  inputSchema: z.object({ a: z.number(), b: z.number() }),
  execute: ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
};

describe("agent loop", () => {
  it("runs a plain text turn", async () => {
    const { agent } = createTestAgent({ script: [{ text: "hi there" }] });
    const result = await agent.send(undefined, "hello");
    expect(result.status).toBe("completed");
    expect(result.output).toBe("hi there");
  });

  it("executes tool calls and feeds results back", async () => {
    const { agent, provider } = createTestAgent({
      tools: [addTool],
      script: [
        { toolCall: { name: "add", input: { a: 2, b: 3 } } },
        (request) => {
          const last = request.messages.at(-1)!;
          const result = last.content.find((p) => p.type === "tool_result");
          return {
            message: { role: "assistant", content: [{ type: "text", text: `sum=${JSON.stringify((result as any).output.sum)}` }] },
            stopReason: "end_turn",
          };
        },
      ],
    });
    const result = await agent.send("s-tools", "add 2 and 3");
    expect(result.output).toBe("sum=5");
    expect(result.steps).toBe(2);
    expect(provider.requests[0]!.tools!.map((t) => t.name)).toContain("add");
  });

  it("returns an error result for invalid tool input instead of crashing", async () => {
    const { agent } = createTestAgent({
      tools: [addTool],
      script: [{ toolCall: { name: "add", input: { a: "nope" } } }, { text: "recovered" }],
    });
    const result = await agent.send("s-bad-input", "go");
    expect(result.status).toBe("completed");
    const session = await agent.session("s-bad-input");
    const events = await session.events();
    const toolResult = events.find((e) => e.event.type === "tool.result");
    expect(toolResult && (toolResult.event as any).isError).toBe(true);
  });

  it("stops at maxSteps", async () => {
    const { agent } = createTestAgent({
      tools: [addTool],
      maxSteps: 3,
      script: Array.from({ length: 10 }, () => ({ toolCall: { name: "add", input: { a: 1, b: 1 } } })),
    });
    const result = await agent.send("s-loop", "loop forever");
    expect(result.status).toBe("max_steps");
    expect(result.steps).toBe(3);
  });

  it("exposes skills through use_skill", async () => {
    const { agent } = createTestAgent({
      skills: [{ name: "greeting", body: "---\nname: greeting\ndescription: How to greet.\n---\nAlways say ahoy." }],
      script: [
        { toolCall: { name: "use_skill", input: { skill: "greeting" } } },
        (request) => {
          const last = request.messages.at(-1)!;
          const output = (last.content[0] as any).output;
          return {
            message: { role: "assistant", content: [{ type: "text", text: output.instructions }] },
            stopReason: "end_turn",
          };
        },
      ],
    });
    const result = await agent.send("s-skill", "greet me");
    expect(result.output).toContain("ahoy");
  });

  it("persists conversation across agent instances (durability)", async () => {
    const first = createTestAgent({ script: [{ text: "one" }] });
    await first.agent.send("shared", "first message");
    // New process simulation: fresh agent over the same store dir
    const second = createTestAgent({ projectDir: first.projectDir, script: [{ text: "two" }] });
    await second.agent.send("shared", "second message");
    const session = await second.agent.session("shared");
    expect(session.messages.length).toBe(4); // 2 user + 2 assistant
  });
});

describe("human-in-the-loop", () => {
  const dangerous: Tool = {
    name: "wire_money",
    description: "Send money",
    approval: true,
    inputSchema: z.object({ amount: z.number() }),
    execute: ({ amount }: { amount: number }) => ({ sent: amount }),
  };

  it("pauses on approval tools and resumes after approve()", async () => {
    const { agent } = createTestAgent({
      tools: [dangerous],
      script: [{ toolCall: { name: "wire_money", input: { amount: 50 } } }, { text: "done, sent" }],
    });
    const paused = await agent.send("s-hitl", "wire 50");
    expect(paused.status).toBe("waiting_approval");
    expect(paused.pendingApprovals).toHaveLength(1);

    const resumed = await agent.approve("s-hitl", paused.pendingApprovals[0]!.toolCallId);
    expect(resumed.status).toBe("completed");
    expect(resumed.output).toBe("done, sent");
  });

  it("supports deny with a reason", async () => {
    const { agent } = createTestAgent({
      tools: [dangerous],
      script: [{ toolCall: { name: "wire_money", input: { amount: 9999 } } }, { text: "understood, cancelled" }],
    });
    const paused = await agent.send("s-deny", "wire it");
    const resumed = await agent.deny("s-deny", paused.pendingApprovals[0]!.toolCallId, { reason: "too much" });
    expect(resumed.status).toBe("completed");
    expect(resumed.output).toContain("cancelled");
  });

  it("survives a restart while waiting for approval", async () => {
    const first = createTestAgent({
      tools: [dangerous],
      script: [{ toolCall: { name: "wire_money", input: { amount: 1 } } }],
    });
    const paused = await first.agent.send("s-restart", "wire 1");
    expect(paused.status).toBe("waiting_approval");

    const second = createTestAgent({
      projectDir: first.projectDir,
      tools: [dangerous],
      script: [{ text: "after restart: done" }],
    });
    const resumed = await second.agent.approve("s-restart", paused.pendingApprovals[0]!.toolCallId);
    expect(resumed.status).toBe("completed");
    expect(resumed.output).toBe("after restart: done");
  });
});

describe("streaming", () => {
  it("yields text chunks", async () => {
    const { agent } = createTestAgent({ script: [{ text: "alpha beta gamma" }] });
    const chunks: string[] = [];
    for await (const chunk of agent.stream("s-stream", "go")) chunks.push(chunk);
    expect(chunks.join("")).toBe("alpha beta gamma");
    expect(chunks.length).toBeGreaterThan(1);
  });
});
