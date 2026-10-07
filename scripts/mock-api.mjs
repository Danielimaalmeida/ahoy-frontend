#!/usr/bin/env node
// `npm run mock:api`: the mock backend of lane 2D (`src/testing/mock-backend/`) as an HTTP server, with no API, Docker,
// Postgres or new dependency. It is the same `MockAhoyServer` the browser uses in `npm run start:mock`: never two mocks.
//
//   npm run mock:api                 listens on http://127.0.0.1:8080 (MOCK_API_PORT, MOCK_API_HOST change it)
//   npm start                        in another terminal: the dev proxy forwards /api/v1 here and adds X-Ahoy-Actor
//   curl -s localhost:4200/api/v1/health
//   curl -N localhost:4200/api/v1/events/stream
//
// Requests are answered as `AHOY_AUTH=dev` would: the actor is the `X-Ahoy-Actor` header (the proxy adds it; without it
// every operation but /health answers 401). Outside /api/v1 there are three control routes, for e2e and for people:
//
//   /__mock/switches?latencyMs=300&failNext=503&conflictNext=stale_version&dropStream=1   (see switches.ts)
//   /__mock/reset          the eight seeded voyages again, switches cleared, streams closed
//   /__mock/health         {"mock":true}
//
// The TypeScript runs on Node 24's type stripping; a module hook resolves the project's import style (extensionless
// relative imports and the @core/@testing/... aliases) to the .ts files. Local development only: never deploy it.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALIASES = {
  "@domain/": "src/app/domain/",
  "@core/": "src/app/core/",
  "@ui/": "src/app/ui/",
  "@features/": "src/app/features/",
  "@testing/": "src/testing/",
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const [alias, dir] of Object.entries(ALIASES))
      if (specifier.startsWith(alias))
        return nextResolve(pathToFileURL(join(root, dir, `${specifier.slice(alias.length)}.ts`)).href, context);
    const fromTs = context.parentURL?.endsWith(".ts") ?? false;
    if (fromTs && /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$|\.json$/.test(specifier))
      return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const major = Number(process.versions.node.split(".")[0]);
if (major < 23) {
  console.error(`mock-api: Node ${process.versions.node} cannot run TypeScript; use Node 24 (see .nvmrc).`);
  process.exit(1);
}

const { MockAhoyServer } = await import("../src/testing/mock-backend/server.ts");
const { applySwitches } = await import("../src/testing/mock-backend/switches.ts");

const BASE = "/api/v1";
const MAX_BODY_BYTES = 1_000_000;
const port = Number(process.env["MOCK_API_PORT"] ?? 8080);
const host = process.env["MOCK_API_HOST"] ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`mock-api: MOCK_API_PORT must be a port number, got ${process.env["MOCK_API_PORT"]}`);
  process.exit(1);
}

const contract = JSON.parse(readFileSync(join(root, "src/testing/fixtures/openapi.json"), "utf8"));
const mock = new MockAhoyServer({ contract });

/** Reads a request body as text, refusing more than the real API accepts. */
async function readText(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Sends a JSON answer of the control routes. */
function sendControl(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "X-Ahoy-Mock": "1" });
  res.end(JSON.stringify(body));
}

/** Writes a mock answer; an event stream is written chunk by chunk, without buffering. */
async function send(req, res, answer) {
  const headers = { ...answer.headers, "X-Ahoy-Mock": "1" };
  if (answer.kind === "stream") {
    res.writeHead(200, { ...headers, Connection: "keep-alive" });
    res.flushHeaders();
    const reader = answer.stream.body.getReader();
    const stop = () => void reader.cancel().catch(() => undefined);
    req.on("close", stop);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch {
      // The mock dropped the stream (`dropStream`): break the connection, as a real network failure would.
      res.destroy();
    }
    return;
  }
  res.writeHead(answer.status, headers);
  if (answer.kind === "json") res.end(JSON.stringify(answer.body));
  else if (answer.kind === "text") res.end(answer.body);
  else res.end();
}

const http = createServer((req, res) => {
  const started = Date.now();
  res.once("finish", () => console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started} ms`));
  void (async () => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/__mock/")) {
      if (url.pathname === "/__mock/health") return sendControl(res, 200, { mock: true });
      if (url.pathname === "/__mock/reset") {
        mock.reset();
        return sendControl(res, 200, { reset: true });
      }
      if (url.pathname === "/__mock/switches") {
        const result = applySwitches(mock, (name) => url.searchParams.get(name));
        return sendControl(res, result.refused.length > 0 ? 400 : 200, { ...result, switches: mock.switches });
      }
      return sendControl(res, 404, { error: `no control route ${url.pathname}` });
    }
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) {
      const problem = { type: "urn:ahoy:problem:not_found", title: "not found", status: 404, code: "not_found" };
      res.writeHead(404, { "Content-Type": "application/problem+json; charset=utf-8", "X-Ahoy-Mock": "1" });
      return res.end(JSON.stringify({ ...problem, detail: `No route for ${url.pathname}` }));
    }
    const headers = {};
    for (const [name, value] of Object.entries(req.headers))
      if (value !== undefined) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
    let text = "";
    try {
      text = await readText(req);
    } catch {
      return send(
        req,
        res,
        mock.handle({
          method: "POST",
          path: "/",
          query: url.searchParams,
          headers,
          body: undefined,
          bodyIsInvalidJson: true,
        }),
      );
    }
    let body;
    let bodyIsInvalidJson = false;
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
        bodyIsInvalidJson = true;
      }
    }
    const latency = mock.switches.latencyMs;
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
    const request = {
      method: req.method ?? "GET",
      path: url.pathname.slice(BASE.length) || "/",
      query: url.searchParams,
      headers,
      body,
      ...(bodyIsInvalidJson ? { bodyIsInvalidJson } : {}),
    };
    return send(req, res, mock.handle(request));
  })().catch((error) => {
    console.error(error);
    if (!res.headersSent) sendControl(res, 500, { error: "mock-api failed; see its terminal" });
    else res.destroy();
  });
});

http.listen(port, host, () => {
  console.log(`mock-api: the Ahoy mock backend listens on http://${host}:${port}${BASE} (0 AIU, fictional data)`);
  console.log("mock-api: run `npm start` beside it; the dev proxy forwards /api/v1 here. Ctrl+C stops it.");
});

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    mock.close();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1_000).unref();
  });
