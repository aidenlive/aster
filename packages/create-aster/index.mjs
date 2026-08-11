#!/usr/bin/env node
// Thin wrapper so `npm create aster@latest my-agent` works with the flow
// people already know from create-next-app. All logic lives in the framework
// (`aster init`), so the two entry points can never drift apart.
const { run } = await import("aster/init");
process.exit(await run(process.argv.slice(2)));
