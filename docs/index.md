# aster documentation

> **TL;DR**
> An aster agent is a directory. `agent/instructions.md` is the prompt; files
> in `tools/`, `skills/`, `subagents/`, `workflows/`, `channels/`, and
> `schedules/` are discovered automatically. The CLI runs, inspects, checks,
> and deploys it. Everything the agent does is recorded durably as events.

## Start here

| Guide | Answers |
| ----- | ------- |
| [Getting started](./getting-started.md) | How do I make my first agent run? |
| [Project structure](./project-structure.md) | Where does each file live and why? |

## Building

| Guide | Answers |
| ----- | ------- |
| [Tools](./tools.md) | How does the model call my typed functions safely? |
| [Skills & subagents](./skills-and-subagents.md) | How do I add procedures and specialists? |
| [Workflows](./workflows.md) | How do I write durable multi-step code? |
| [Channels & schedules](./channels-and-schedules.md) | How does the agent talk to the world and act on a clock? |

## Operating

| Guide | Answers |
| ----- | ------- |
| [Sessions & durability](./sessions-and-durability.md) | What survives a crash, and how? |
| [Providers](./providers.md) | How do I switch or add model providers? |
| [Observability](./observability.md) | How do I see what the agent actually did? |
| [Deployment](./deployment.md) | How do I ship this to production? |
| [Customization](./customization.md) | How do I configure providers, brand my agent, or white-label? |

## Understanding

| Guide | Answers |
| ----- | ------- |
| [Architecture](./architecture.md) | How the pieces fit, and the decisions behind them. |
