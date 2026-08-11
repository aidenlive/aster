#!/usr/bin/env node
import { isAsterError } from "../errors.js";

const HELP = `aster — filesystem-first framework for durable AI agents

Usage: aster <command> [options]

Commands
  init [dir]                Scaffold a new agent project (interactive on a TTY)
                            --yes  --name <n>  --provider anthropic|openai|compatible|offline
                            --model <provider/model>  --base-url <url>  --preset minimal|standard|team
  dev [dir]                 Interactive chat + HTTP server + hot reload
  run [dir] -p "..."        Run one prompt (or --workflow / --schedule / --serve)
  build [dir]               Validate & typecheck the project for release
  inspect <what> [dir]      project | sessions | session <id> | trace <id>
  deploy [dir]              Produce a production deployment bundle

Global options
  --json                    Machine-readable output where supported
  -h, --help                Show help for a command

Environment
  ANTHROPIC_API_KEY / OPENAI_API_KEY   provider credentials
  ASTER_OFFLINE=1                      use the offline mock provider
  ASTER_LOG_LEVEL / ASTER_LOG_FORMAT   logging (debug|info|warn|error, json)
  ASTER_SANDBOX_ENV                    comma list of env vars visible to sandboxed tools

Docs: ./docs in the aster package (also on disk at node_modules/aster/docs)
`;

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "-h" || command === "--help" || command === "help") {
    process.stdout.write(HELP);
    return command ? 0 : 1;
  }
  if (command === "--version" || command === "-v") {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { join, dirname } = await import("node:path");
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    process.stdout.write(`aster ${pkg.version}\n`);
    return 0;
  }
  switch (command) {
    case "init":
      return (await import("./init.js")).run(rest);
    case "dev":
      return (await import("./dev.js")).run(rest);
    case "run":
      return (await import("./run.js")).run(rest);
    case "build":
      return (await import("./build.js")).run(rest);
    case "inspect":
      return (await import("./inspect.js")).run(rest);
    case "deploy":
      return (await import("./deploy.js")).run(rest);
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (isAsterError(error)) {
      process.stderr.write(`error [${error.code}]: ${error.message}\n`);
    } else {
      process.stderr.write(`error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    }
    process.exit(1);
  });
