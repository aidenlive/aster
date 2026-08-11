# Example: research-team

A fuller aster project showing every capability working together:

| Capability     | Where                                             |
| -------------- | ------------------------------------------------- |
| Subagents      | `agent/subagents/researcher`, `agent/subagents/writer` |
| Skills         | `agent/skills/style_guide.md`                     |
| HITL approval  | `agent/tools/publish.ts` (`approval: true`)       |
| Sandboxed tool | `agent/tools/word_count.ts` (`isolation: "process"`) |
| Durable workflow | `agent/workflows/daily_brief.ts`                |
| Schedule       | `agent/schedules/morning_brief.ts`                |
| Custom channel | `agent/channels/log_channel.ts`                   |

```sh
npm install aster zod
export ASTER_OFFLINE=1        # runs fully offline with the mock provider
npx aster dev
npx aster run --workflow daily_brief --input '{"topic":"solar"}'
npx aster inspect project
```
