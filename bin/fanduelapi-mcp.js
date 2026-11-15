#!/usr/bin/env node
// FanDuel API MCP server over stdio. It relays each JSON-RPC message from the client to the hosted server at
// https://fanduelapi.com/api/mcp (stateless streamable HTTP) with your key, and writes the reply back on stdout.
// Without FANDUEL_API_KEY the keyless tools still work: search_docs, fetch_doc, get_sample_props and agent signup.
// FanDuel API is an independent data service operated by Stunning Couches LLC, not affiliated with FanDuel.
import { createInterface } from "node:readline";

const VERSION = "0.1.0";
const URL_ = process.env.FANDUEL_MCP_URL || "https://fanduelapi.com/api/mcp";
const KEY = process.env.FANDUEL_API_KEY || "";
const TIMEOUT_MS = Number(process.env.FANDUEL_MCP_TIMEOUT_MS || 60000);

const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const log = (...a) => process.stderr.write(`[fanduelapi-mcp] ${a.join(" ")}\n`);

/** Reads a JSON body or the data lines of a text/event-stream body; returns every JSON-RPC message in it. */
async function messages(res) {
  const text = await res.text();
  if (!text.trim()) return [];
  if ((res.headers.get("content-type") || "").includes("text/event-stream")) {
    return text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean).map((l) => JSON.parse(l));
  }
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function relay(msg) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": `fanduelapi-mcp/${VERSION}` };
  if (KEY) headers.authorization = `Bearer ${KEY}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_, { method: "POST", headers, body: JSON.stringify(msg), signal: ctrl.signal });
    const out = await messages(res).catch(() => []);
    if (!res.ok && !out.length && msg.id !== undefined) return [{ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `Upstream HTTP ${res.status}` } }];
    return out;
  } catch (e) {
    return msg.id === undefined ? [] : [{ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `Could not reach ${URL_}: ${e.message}` } }];
  } finally {
    clearTimeout(timer);
  }
}

const rl = createInterface({ input: process.stdin });
let pending = 0, closed = false;
const done = () => { if (closed && pending === 0) process.exit(0); };
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  pending++;
  try {
    // Notifications (no id) are relayed for the server's benefit; their replies are not written back.
    const replies = await relay(msg);
    if (msg.id !== undefined) for (const r of replies) write(r);
  } finally { pending--; done(); }
});
rl.on("close", () => { closed = true; done(); });
log(`relaying to ${URL_}${KEY ? " with a key" : " without a key (keyless tools only)"}`);
