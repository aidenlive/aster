import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseModelString, ProviderRegistry } from "../src/providers/provider.js";
import { mock } from "../src/providers/mock.js";
import { toJsonSchema } from "../src/tools/define.js";
import { buildTraces } from "../src/observability/trace.js";
import { createTestAgent } from "../src/testing/index.js";

describe("providers", () => {
  it("parses model strings", () => {
    expect(parseModelString("anthropic/claude-sonnet-4-6")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(() => parseModelString("nope")).toThrow();
  });

  it("resolves from the registry", () => {
    const registry = new ProviderRegistry().register(mock());
    expect(registry.resolve("mock/echo").provider.name).toBe("mock");
    expect(() => registry.resolve("missing/x")).toThrow(/No provider/);
  });
});

describe("tool JSON schema", () => {
  it("converts zod to JSON schema for providers", () => {
    const schema = toJsonSchema(z.object({ city: z.string().describe("City name"), days: z.number().optional() }));
    expect(schema.type).toBe("object");
    expect((schema.properties as any).city.type).toBe("string");
    expect(schema.required).toEqual(["city"]);
  });
});

describe("traces", () => {
  it("builds spans from the event log", async () => {
    const { agent } = createTestAgent({ script: [{ text: "ok" }] });
    await agent.send("s-trace", "hello");
    const session = await agent.session("s-trace");
    const traces = buildTraces(await session.events());
    expect(traces).toHaveLength(1);
    expect(traces[0]!.status).toBe("completed");
    expect(traces[0]!.spans.some((s) => s.kind === "model" && s.status === "ok")).toBe(true);
  });
});
