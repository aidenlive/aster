# Channels & schedules

> **TL;DR**
> Channels connect the agent to the outside world; schedules make it act on a
> clock. The HTTP channel is built in; both custom kinds are single files.

## The built-in HTTP channel

`aster dev` and `aster run --serve` expose:

| Endpoint | Body | Returns |
| -------- | ---- | ------- |
| `POST /v1/messages` | `{ "sessionId?", "message" }` | `{ sessionId, output, status }` |
| `POST /v1/messages/stream` | same | Server-sent events: `{"text": "…"}` chunks |
| `GET /v1/health` | — | `{ ok, agent }` |

Omit `sessionId` to start a fresh conversation; reuse one to continue it.

## Custom channels

`agent/channels/slack.ts`:

```ts
import { defineChannel } from "aster/channels";

export default defineChannel({
  description: "Bridges a Slack channel to the agent.",
  async start(ctx) {
    const slack = await connectSlack(process.env.SLACK_TOKEN!);
    slack.onMessage(async (msg) => {
      const { output } = await ctx.agent.send(`slack-${msg.channel}`, msg.text);
      await slack.post(msg.channel, output);
    });
    return () => slack.disconnect();   // cleanup on shutdown
  },
});
```

The contract is three lines long: receive input however your transport works,
call `ctx.agent.send` (or `ctx.agent.stream`), deliver the reply, return a
cleanup function. Session-id choice is the channel's — one session per Slack
channel, per user, per thread; whatever maps to a "conversation" there.

## Schedules

`agent/schedules/weekly_recap.ts`:

```ts
import { defineSchedule } from "aster/schedules";

export default defineSchedule({
  description: "Monday 9am recap.",
  cron: "0 9 * * 1",
  async run(ctx) {
    const recap = await ctx.prompt("Write this week's recap from the notes in state.");
    await postToSlack(recap);
  },
});
```

- Five-field cron (`minute hour day-of-month month day-of-week`), local time,
  with lists, ranges, and steps. Invalid expressions fail at load time.
- Each schedule prompts into its own persistent session
  (`schedule-<name>`), so runs share memory week over week.
- Overlap protection: a still-running schedule is skipped, not double-fired.

```sh
aster run --schedule weekly_recap    # fire one schedule right now, for testing
```

> **Note**
> The in-process scheduler ticks while `dev` or `run --serve` is up. For
> serverless deployments, trigger `aster run --schedule <name>` from an
> external cron instead.
