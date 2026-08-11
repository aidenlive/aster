import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { run as buildRun } from "./build.js";

/**
 * `aster deploy [dir]` — produce a self-contained production bundle.
 *
 * Runs the release gate, then writes `dist-deploy/` containing the agent
 * directory, project manifest, a Dockerfile, and a start script that serves
 * the agent (`aster run --serve`). Deployment targets are intentionally an
 * open surface: the bundle runs on any host with Node >=22.18 or any
 * container platform. Cloud-specific adapters can wrap this output.
 */
export async function run(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: { out: { type: "string" }, "skip-checks": { type: "boolean" }, json: { type: "boolean" } },
    allowPositionals: true,
  });
  const projectDir = resolve(positionals[0] ?? ".");

  if (!values["skip-checks"]) {
    const buildCode = await buildRun([projectDir]);
    if (buildCode !== 0) {
      process.stderr.write("\ndeploy aborted: build checks failed (use --skip-checks to override)\n");
      return buildCode;
    }
  }

  const outDir = resolve(values.out ?? join(projectDir, "dist-deploy"));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  cpSync(join(projectDir, "agent"), join(outDir, "agent"), { recursive: true });
  for (const file of ["package.json", "package-lock.json", "tsconfig.json"]) {
    const src = join(projectDir, file);
    if (existsSync(src)) cpSync(src, join(outDir, file));
  }

  writeFileSync(
    join(outDir, "Dockerfile"),
    `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV NODE_ENV=production
ENV PORT=3111
EXPOSE 3111
CMD ["npx", "aster", "run", "--serve"]
`,
  );
  writeFileSync(
    join(outDir, "start.sh"),
    `#!/bin/sh
# Start the agent in production mode. Requires provider credentials in env.
exec npx aster run --serve --port "\${PORT:-3111}"
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(outDir, "DEPLOY.md"),
    `# Deploying this agent

This bundle is self-contained. Two ways to run it:

## Directly (Node >= 22.18)

    npm install --omit=dev
    export ANTHROPIC_API_KEY=...
    ./start.sh

## Container

    docker build -t my-agent .
    docker run -e ANTHROPIC_API_KEY=... -p 3111:3111 my-agent

The agent serves the built-in HTTP channel:

    POST /v1/messages          {"sessionId": "...", "message": "..."}
    POST /v1/messages/stream   same body, SSE response
    GET  /v1/health

Durable state lives under \`.aster/\`. Mount it as a volume to persist
sessions across container restarts:

    docker run -v aster-data:/app/.aster ...
`,
  );

  process.stdout.write(`\ndeploy bundle written to ${outDir}\n  see ${join(outDir, "DEPLOY.md")}\n`);
  return 0;
}
