# x402-events

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402-0052ff.svg)](https://x402.org)
[![USDC on Base](https://img.shields.io/badge/USDC-Base-0052ff.svg)](https://base.org)
[![USDC on Solana](https://img.shields.io/badge/USDC-Solana-14f195.svg)](https://solana.com)

**Event search and on-sale checks over Ticketmaster Discovery — agents find real
events and ticket windows.** $0.003 per search, $0.002 per on-sale poll, in USDC
on Base *or* Solana. Events, venues, dates and price ranges come back in the
response body; the on-sale route returns a full snapshot plus a delta against
your last cursor.

Docs site: **https://nirholas.github.io/x402-events/**

## Why x402 for this

Ticket data is time-critical and bursty: an agent watching for a drop wants to
poll one event every few minutes for a week, then never again. Subscriptions
price that badly in both directions — a monthly tier is wasted on a one-off
check and too rigid for a burst. With x402 the agent pays $0.002 per poll, on
whichever chain it holds funds on, with no key to provision and no plan to
cancel. And because each poll returns a complete snapshot (not just a "nothing
changed" ping), every payment buys something usable.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-events
cd x402-events
npm install
npm run dev            # http://localhost:4023 — no configuration needed
```

See the price with no wallet at all:

```bash
curl -s "http://localhost:4023/search?keyword=jazz&city=Chicago&countryCode=US&size=2" | jq
# 402 + accepts: [ USDC on Base, USDC on Solana ]
```

Then buy it, from an agent (wallet funded with Base Sepolia USDC —
https://faucet.circle.com):

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

## API

| Route | Price | What you get back |
|-------|-------|-------------------|
| `GET /search` | **$0.003** | Events with venue, local and UTC start times, status, genre, price ranges and a ticket link |
| `GET /onsale-check/:eventId` | **$0.002** | A complete on-sale snapshot — state, public and presale windows, price ranges, ticket link, and a fresh cursor — plus the field-by-field delta since the cursor you sent |
| `GET /` | free | Service metadata, live prices, active payment rails, backend status |
| `GET /health` | free | Liveness probe |
| `GET /.well-known/x402` | free | Machine-readable discovery manifest |

Full reference: [docs/api.md](docs/api.md) · [openapi.json](openapi.json)

## How x402 works

**Pay in USDC on Base or Solana — your client picks the rail.**

1. **402** — the route, called without payment, replies HTTP 402 with an
   `accepts` array holding **both** rails: exact price
   ($0.003 → `3000` USDC base units), asset, and `payTo`.
2. **Sign** — on Base, the client signs an EIP-3009 USDC authorization (no gas
   from the payer). On Solana, it signs an SPL `transferChecked` whose fee payer
   is the facilitator's sponsor account (so the buyer needs USDC only, no SOL).
3. **Settle** — the server hands the payload to the facilitator
   (`https://x402.org/facilitator`), which verifies and settles on the chosen chain.
4. **200** — the same request returns the artifact in the body, with the
   settlement receipt in the `X-PAYMENT-RESPONSE` header.

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Those are the suite's public receive addresses and the server's defaults. Set
`PAY_TO_ADDRESS` / `SOLANA_PAY_TO_ADDRESS` to be paid yourself.

Walkthroughs: [examples/curl.md](examples/curl.md) ·
[examples/agent-client.ts](examples/agent-client.ts) ·
[docs/tutorial.md](docs/tutorial.md)

## Real backend / API keys

| Env | Effect |
|-----|--------|
| `TICKETMASTER_API_KEY` | Live [Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) data (`source: "ticketmaster"`). The consumer key is free — register an app and copy the Consumer Key. |
| *(unset)* | Deterministic fixture events, honestly labelled `source: "fixture"`. Same query → same events, and fixture event ids work on `/onsale-check/:eventId` so the polling flow is fully demonstrable. The demo never requires a key. |

All variables: [.env.example](.env.example)

## For AI agents

- **[skill.md](skill.md)** — agent-facing skill file: endpoints, prices,
  schemas, both payment rails. Point your agent at it.
- **`GET /.well-known/x402`** — discovery manifest listing every resource with
  both networks. Indexable by [x402scan.com](https://x402scan.com), the x402
  Bazaar, and [agentic.market](https://agentic.market).
- **MCP** — [examples/mcp-tool.md](examples/mcp-tool.md) exposes these routes as
  Claude MCP tools, with per-wallet spend caps and a
  `claude_desktop_config.json` example.
- More: [docs/agents.md](docs/agents.md)

## Docs

- Landing: https://nirholas.github.io/x402-events/
- [Tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [For AI agents](docs/agents.md)

## Support

Questions, bugs, or a listing request: **nichxbt@gmail.com** ·
[open an issue](https://github.com/nirholas/x402-events/issues)

## License

Apache-2.0. Part of the [x402 Suite](https://github.com/nirholas/x402-suite).
