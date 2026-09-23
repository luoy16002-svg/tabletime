const KEY = "tabletime.dinner.v1";
let instance;
export async function makeClient() {
  if (instance) return instance;
  let live = false;
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    try {
      const r = await fetch("/health");
      if (r.ok) live = (await r.json()).transport === "Streamable HTTP";
    } catch {}
  }
  if (live) {
    const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
    ]);
    const client = new Client({
      name: "tabletime-kitchen-display",
      version: "0.1.0",
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("/mcp", location.href)),
    );
    instance = {
      mode: "MCP connected",
      call: async (name, args = {}) => {
        const r = await client.callTool({ name, arguments: args });
        if (r.isError)
          throw new Error(
            r.content?.find((c) => c.type === "text")?.text ??
              "The kitchen could not complete that request.",
          );
        return (
          r.structuredContent ??
          JSON.parse(r.content.find((c) => c.type === "text").text)
        );
      },
    };
  } else {
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      }),
      pending = new Map();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY));
    } catch {}
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if (!p) return;
      if (data.error) return p.reject(new Error(data.error));
      try {
        localStorage.setItem(KEY, JSON.stringify(data.state));
      } catch {}
      p.resolve(data.result);
    };
    worker.onerror = () => {
      for (const p of pending.values())
        p.reject(
          new Error(
            "The local solver could not load. Reload the page to try again.",
          ),
        );
      pending.clear();
    };
    instance = {
      mode: "Private browser demo",
      call: (name, args = {}) =>
        new Promise((resolve, reject) => {
          const id = crypto.randomUUID();
          pending.set(id, { resolve, reject });
          worker.postMessage({ id, name, args, state: saved });
          saved = null;
        }),
    };
  }
  return instance;
}
