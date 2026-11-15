// Spawns the stdio server against a local fake upstream. Live check: FANDUEL_LIVE=1 npm test
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/fanduelapi-mcp.js", import.meta.url));
const seen = [];
const upstream = createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const msg = JSON.parse(raw);
    seen.push({ msg, auth: req.headers.authorization });
    if (msg.id === undefined) { res.writeHead(202); return res.end(); }
    if (msg.method === "initialize") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", serverInfo: { name: "fanduelapi" }, capabilities: { tools: {} } } })); }
    if (msg.method === "tools/list") { res.writeHead(200, { "content-type": "text/event-stream" }); return res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "get_sample_props" }] } })}\n\n`); }
    res.writeHead(500); res.end();
  });
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${upstream.address().port}/api/mcp`;
test.after(() => upstream.close());

function run(lines, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN], { env: { ...process.env, FANDUEL_MCP_URL: URL_, FANDUEL_API_KEY: "", ...env } });
    let out = ""; child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))));
    for (const l of lines) child.stdin.write(JSON.stringify(l) + "\n");
    child.stdin.end();
  });
}

test("relays initialize, notifications and tools/list (JSON and SSE replies) and writes only replies with an id", async () => {
  const out = await run([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  const byId = Object.fromEntries(out.map((m) => [m.id, m]));
  assert.equal(byId[1].result.serverInfo.name, "fanduelapi");
  assert.equal(byId[2].result.tools[0].name, "get_sample_props");
  assert.equal(out.length, 2, "the notification gets no reply on stdout");
  assert.ok(seen.some((s) => s.msg.method === "notifications/initialized"));
});

test("sends the key as a Bearer token when FANDUEL_API_KEY is set, and none when it is not", async () => {
  await run([{ jsonrpc: "2.0", id: 3, method: "tools/list" }], { FANDUEL_API_KEY: "fd_test" });
  assert.equal(seen.at(-1).auth, "Bearer fd_test");
  await run([{ jsonrpc: "2.0", id: 4, method: "tools/list" }]);
  assert.equal(seen.at(-1).auth, undefined);
});

test("an upstream failure becomes a JSON-RPC error, and bad JSON a parse error", async () => {
  const out = await run([{ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "x" } }]);
  assert.equal(out[0].id, 5);
  assert.equal(out[0].error.code, -32000);
  const bad = await new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN], { env: { ...process.env, FANDUEL_MCP_URL: URL_ } });
    let o = ""; child.stdout.on("data", (d) => (o += d)); child.on("close", () => resolve(JSON.parse(o.trim())));
    child.stdin.end("{not json\n");
  });
  assert.equal(bad.error.code, -32700);
});

test("live: the hosted server lists the keyless sample tool and returns real props without a key", { skip: process.env.FANDUEL_LIVE !== "1" }, async () => {
  const out = await run([
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_sample_props", arguments: { sport: "nba" } } },
  ], { FANDUEL_MCP_URL: "https://fanduelapi.com/api/mcp" });
  const byId = Object.fromEntries(out.map((m) => [m.id, m]));
  assert.ok(byId[1].result.tools.some((t) => t.name === "get_sample_props"));
  const rows = JSON.parse(byId[2].result.content[0].text).data;
  assert.ok(rows.length && "line" in rows[0]);
});
