# Exposing x402-events as an MCP tool

[MCP](https://modelcontextprotocol.io) lets Claude (and other MCP clients) call
this service directly. The wrapper below holds the wallet, pays the x402
invoice, and hands the artifact straight back to the model.

## Minimal server

```ts
// mcp-x402-events.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSigner, wrapFetchWithPayment } from "x402-fetch";
import { z } from "zod";

const BASE_URL = process.env.EVENTS_URL ?? "http://localhost:4023";

const signer = await createSigner("base-sepolia", process.env.PRIVATE_KEY!);
const payFetch = wrapFetchWithPayment(fetch, signer);

const server = new McpServer({ name: "x402-events", version: "0.1.0" });

server.tool(
  "search_events",
  "Search real events by keyword, city, country and start date",
  {
    keyword: z.string().optional().describe("Free-text search across event, attraction and venue names."),
    city: z.string().optional().describe("City name, e.g. `Chicago`."),
    countryCode: z.string().optional().describe("Two-letter ISO country code, e.g. `US`, `GB`."),
    startDateTime: z.string().optional().describe("Only events starting at or after this UTC instant, `YYYY-MM-DDTHH:MM:SSZ`."),
    size: z.number().optional().describe("Maximum results, 1…50. Default 10."),
  },
  async (args) => {
    const url = new URL(`${BASE_URL}/search`);
    for (const k of ["keyword", "city", "countryCode", "startDateTime", "size"] as const) {
      if (args[k] != null) url.searchParams.set(k, String(args[k]));
    }
    const res = await payFetch(url);
    if (!res.ok) throw new Error(`GET /search → ${res.status}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "onsale_check",
  "Current on-sale snapshot for one event, plus a delta against your cursor",
  {
    eventId: z.string().describe("Event id as returned by `/search` (a Ticketmaster id, or a `FIX…` id in fixture mode)."),
    cursor: z.string().optional().describe("The `snapshot.cursor` from a previous call. Supplying it populates `delta`."),
  },
  async (args) => {
    const url = new URL(`${BASE_URL}/onsale-check/${encodeURIComponent(args.eventId)}`);
    if (args.cursor) url.searchParams.set("cursor", args.cursor);
    const res = await payFetch(url);
    if (!res.ok) throw new Error(`GET /onsale-check/:eventId → ${res.status}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

## Wire it into Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402-events": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-x402-events.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedTestKey",
        "EVENTS_URL": "http://localhost:4023"
      }
    }
  }
}
```

## Spending caps

Each GET /search call costs $0.003. Wrap `payFetch` with a
budget so a runaway loop cannot drain the wallet:

```ts
let spentMicros = 0;
const CAP_MICROS = 1_000_000; // $1.00

const cappedFetch: typeof fetch = async (input, init) => {
  if (spentMicros >= CAP_MICROS) throw new Error("x402 spend cap reached");
  const res = await payFetch(input, init);
  const receipt = res.headers.get("X-PAYMENT-RESPONSE");
  if (receipt) {
    const { amount } = JSON.parse(Buffer.from(receipt, "base64").toString());
    spentMicros += Number(amount ?? 0);
  }
  return res;
};
```

## Notes

- The tool descriptions above come from [`skill.md`](../skill.md) — keep them in
  sync so the model knows exactly what it is buying.
- Paying on Solana instead? Swap `x402-fetch` for a Solana x402 client; the 402
  challenge already advertises the `solana` rail, so nothing on this
  server changes.
- Discovery for autonomous agents: [`/.well-known/x402`](../public/.well-known/x402).
