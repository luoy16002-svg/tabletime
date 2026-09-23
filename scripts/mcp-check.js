import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "tabletime-check-")),
  port = 4329,
  url = `http://127.0.0.1:${port}/mcp`;
let proc;
async function start() {
  proc = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(port), TABLETIME_STATE_DIR: folder },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server startup timed out")),
      10000,
    );
    proc.stdout.on("data", (d) => {
      if (d.toString().includes("MCP:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Server exited " + code));
    });
  });
}
async function stop() {
  if (proc && !proc.killed) {
    const p = proc;
    await new Promise((resolve) => {
      p.once("exit", resolve);
      p.kill();
    });
  }
}
async function connect() {
  const c = new Client({
    name: "tabletime-independent-check",
    version: "1.0.0",
  });
  await c.connect(new StreamableHTTPClientTransport(new URL(url)));
  return c;
}
const read = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
let a, b;
try {
  await start();
  const init = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "protocol-check", version: "1" },
      },
    }),
  });
  assert.equal((await init.json()).result.protocolVersion, "2025-11-25");
  const rejected = await fetch(url, {
    method: "POST",
    headers: {
      origin: "https://example.com",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(rejected.status, 403);
  a = await connect();
  b = await connect();
  assert.equal((await a.listTools()).tools.length, 5);
  const first = read(
    await a.callTool({
      name: "draft_dinner",
      arguments: { recipes: ["lentils"], readyIn: 45 },
    }),
  ).proposal;
  const competing = read(
    await b.callTool({
      name: "draft_dinner",
      arguments: { recipes: ["couscous"], readyIn: 45 },
    }),
  ).proposal;
  const args = {
    proposalId: first.id,
    expectedRevision: 0,
    requestId: "mcp-integration-0001",
  };
  assert.equal(
    read(await a.callTool({ name: "accept_dinner", arguments: args })).revision,
    1,
  );
  assert.equal(
    read(await a.callTool({ name: "accept_dinner", arguments: args })).replayed,
    true,
  );
  assert.equal(
    (
      await b.callTool({
        name: "accept_dinner",
        arguments: {
          proposalId: competing.id,
          expectedRevision: 0,
          requestId: "mcp-integration-0002",
        },
      })
    ).isError,
    true,
  );
  const simmer = first.result.steps.find((t) => t.id === "lentils_simmer");
  const repaired = read(
    await a.callTool({
      name: "draft_repair",
      arguments: {
        expectedRevision: 1,
        now: simmer.start + 1,
        simulateProgress: true,
        delay: { id: simmer.id, minutes: 8 },
      },
    }),
  );
  assert.equal(repaired.result.checked.valid, true);
  assert.equal(
    repaired.proposal.problem.tasks.find((t) => t.id === simmer.id).fixed.start,
    simmer.start,
  );
  await a.callTool({
    name: "accept_dinner",
    arguments: {
      proposalId: repaired.proposal.id,
      expectedRevision: 1,
      requestId: "mcp-integration-0003",
    },
  });
  await a.close();
  await b.close();
  await stop();
  await start();
  a = await connect();
  const resumed = read(
    await a.callTool({ name: "read_dinner", arguments: {} }),
  );
  assert.equal(resumed.revision, 2);
  assert.equal(resumed.active.id, repaired.proposal.id);
  const result = {
    protocol: "2025-11-25",
    transport: "Streamable HTTP",
    tools: 5,
    checks: [
      "official SDK client connects",
      "cross-origin request rejected",
      "proposal does not commit",
      "duplicate confirmation idempotent",
      "stale confirmation rejected",
      "delay preserves started steps",
      "restart preserves confirmed dinner",
    ],
    passed: true,
  };
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/mcp-check.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await a?.close().catch(() => {});
  await b?.close().catch(() => {});
  await stop();
  const resolved = path.resolve(folder);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("tabletime-check-")
  )
    fs.rmSync(resolved, { recursive: true, force: true });
}
