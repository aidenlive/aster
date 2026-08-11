import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createLogger } from "../log.js";
import type { ChannelAgentHandle } from "./define.js";

const log = createLogger({ component: "http-channel" });

/**
 * Built-in HTTP channel, served by `aster dev` and `aster run --serve`.
 *
 *   POST /v1/messages       { sessionId?, message }  → { sessionId, output, status }
 *   POST /v1/messages/stream same body               → text/event-stream of {text} chunks
 *   GET  /v1/health                                  → { ok, agent }
 */
export function createHttpChannelServer(agent: ChannelAgentHandle, options: { port: number }) {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/v1/health") {
        return json(res, 200, { ok: true, agent: agent.agentName });
      }
      if (req.method === "POST" && req.url === "/v1/messages") {
        const body = await readJson(req);
        const sessionId = str(body.sessionId) ?? `http-${Date.now().toString(36)}`;
        const message = str(body.message);
        if (!message) return json(res, 400, { error: "message is required" });
        const result = await agent.send(sessionId, message);
        return json(res, 200, { sessionId, ...result });
      }
      if (req.method === "POST" && req.url === "/v1/messages/stream") {
        const body = await readJson(req);
        const sessionId = str(body.sessionId) ?? `http-${Date.now().toString(36)}`;
        const message = str(body.message);
        if (!message) return json(res, 400, { error: "message is required" });
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(`event: session\ndata: ${JSON.stringify({ sessionId })}\n\n`);
        for await (const chunk of agent.stream(sessionId, message)) {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }
        res.write("event: done\ndata: {}\n\n");
        return res.end();
      }
      json(res, 404, { error: "not found" });
    } catch (error) {
      log.error("request failed", { error: String(error) });
      if (!res.headersSent) json(res, 500, { error: "internal error" });
      else res.end();
    }
  });

  return {
    listen(): Promise<void> {
      return new Promise((resolve) => server.listen(options.port, () => resolve()));
    },
    close(): Promise<void> {
      return new Promise((resolve) => server.close(() => resolve()));
    },
    server,
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
