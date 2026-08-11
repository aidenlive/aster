import { defineChannel } from "aster/channels";

/**
 * Minimal custom channel: pipes stdin lines to the agent when the runtime is
 * started with `aster run --serve`. Real channels (Slack, Discord, queues)
 * follow the same shape: subscribe to input, call ctx.agent.send, deliver the
 * reply, and return a cleanup function.
 */
export default defineChannel({
  description: "Echoes agent replies for messages piped to stdin (serve mode).",
  start(ctx) {
    const onData = async (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (!line) return;
      const { output } = await ctx.agent.send("stdin", line);
      ctx.log(`reply: ${output}`);
    };
    process.stdin.on("data", onData);
    return () => {
      process.stdin.off("data", onData);
    };
  },
});
