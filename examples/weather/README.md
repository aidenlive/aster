# Example: weather

The smallest useful aster agent — one instruction file, one tool.

```sh
cd examples/weather
npm install aster zod
export ANTHROPIC_API_KEY=...     # or ASTER_OFFLINE=1
npx aster dev
```

Ask: "what's the weather in Paris?" — the agent calls `get_weather` and
answers from the (mocked) result.
