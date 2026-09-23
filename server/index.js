import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import loadHighs from "highs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Kitchen, emptyState } from "../core/kitchen.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT ?? 4318),
  host = "127.0.0.1";
const stateDir =
  process.env.TABLETIME_STATE_DIR ?? path.join(root, ".tabletime");
fs.mkdirSync(stateDir, { recursive: true });
const stateFile = path.join(stateDir, "dinner.json");
const state = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
  : emptyState();
if (state.schema !== 1) throw new Error("Unsupported saved dinner format.");
const highs = await loadHighs();
const kitchen = new Kitchen(highs, state, (s) => {
  const temp = stateFile + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(s));
  fs.renameSync(temp, stateFile);
});
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  const allowed = new Set([`${host}:${port}`, `localhost:${port}`]);
  if (!allowed.has(req.headers.host))
    return res.status(403).json({ error: "Local kitchen only." });
  if (
    req.headers.origin &&
    ![`http://${host}:${port}`, `http://localhost:${port}`].includes(
      req.headers.origin,
    )
  )
    return res.status(403).json({ error: "Untrusted origin." });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
const tools = {
  kitchen_menu: {
    description:
      "Read the original four-portion demo recipes, available cooking methods, and explicit assumptions.",
    schema: {},
  },
  read_dinner: {
    description:
      "Resume the current dinner, revision and recent confirmed changes. No mutation.",
    schema: {},
  },
  draft_dinner: {
    description:
      "Find a verified kitchen schedule. Returns a proposal; dinner is unchanged until the cook approves accept_dinner. Explain serving time and method choices.",
    schema: {
      recipes: z
        .array(z.enum(["lentils", "courgettes", "couscous", "flatbreads"]))
        .min(1)
        .max(4)
        .optional(),
      readyIn: z.number().int().min(0).max(240).default(60),
      cooks: z.number().int().min(1).max(3).default(1),
      hobs: z.number().int().min(0).max(3).default(2),
      oven: z.boolean().default(true),
    },
  },
  draft_repair: {
    description:
      "Preview a repair after delays or appliance changes. Preserve confirmed dinner until approved. Advancing time is a DEMO SIMULATION ONLY: simulateProgress must be explicitly true. Never claim sensors observed progress. If no feasible schedule exists, present the verified alternative and ask for approval.",
    schema: {
      expectedRevision: z.number().int().nonnegative(),
      now: z.number().int().min(0).max(240).optional(),
      simulateProgress: z.boolean().default(false),
      delay: z
        .object({
          id: z.string().max(64),
          minutes: z.number().int().min(1).max(60),
        })
        .optional(),
      ovenOff: z.boolean().optional(),
      cooks: z.number().int().min(1).max(3).optional(),
    },
  },
  accept_dinner: {
    description:
      "Confirm a previously reviewed schedule ONLY after the cook approves that exact proposal. Use expectedRevision for concurrency and a fresh requestId (reuse it on retries). Does not turn on appliances or purchase anything.",
    schema: {
      proposalId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative(),
      requestId: z.string().min(8).max(100),
    },
  },
};
function server() {
  const mcp = new McpServer(
    { name: "tabletime", version: "0.1.0" },
    {
      instructions:
        "Help a cook get every dish to the table together. Read the current dinner before changing it. Use verified tool output for all timing claims. Present changes in plain language and ask before confirming. This is a planning prototype: no appliance control, live sensing, or food-safety validation.",
    },
  );
  for (const [name, t] of Object.entries(tools))
    mcp.registerTool(
      name,
      {
        description: t.description,
        inputSchema: t.schema,
        annotations: {
          readOnlyHint: ["kitchen_menu", "read_dinner"].includes(name),
          destructiveHint: false,
          openWorldHint: false,
          idempotentHint: name === "accept_dinner",
        },
      },
      async (args) => {
        try {
          const result = kitchen.call(name, args);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (e) {
          return {
            isError: true,
            content: [{ type: "text", text: e.message }],
          };
        }
      },
    );
  return mcp;
}
app.get("/health", (req, res) =>
  res.json({
    ok: true,
    transport: "Streamable HTTP",
    protocol: "2025-11-25",
    mode: "local-kitchen",
  }),
);
app.post("/mcp", async (req, res) => {
  const mcp = server(),
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
  res.on("close", () => {
    transport.close();
    mcp.close();
  });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent)
      res
        .status(500)
        .json({ error: "The kitchen could not complete this request." });
  }
});
app.all("/mcp", (req, res) => res.status(405).set("Allow", "POST").end());
app.use(express.static(path.join(root, "dist")));
app.use((err, req, res, next) =>
  res.status(400).json({ error: "Invalid request." }),
);
app.listen(port, host, () =>
  console.log(
    `Tabletime: http://${host}:${port}\nMCP: http://${host}:${port}/mcp`,
  ),
);
