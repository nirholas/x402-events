# For AI agents — x402-events

`x402-events` gives an agent two things it cannot get cheaply anywhere else:
"what is happening near X" and "has this event gone on sale yet". Both are one
paid HTTP call, no developer account, no quota tier. The on-sale route is
designed for polling — pay $0.002, get a full snapshot **and** a delta against
your last cursor.

## 1. Discover

Two machine-readable descriptions, both free to fetch:

| Where | What it is |
|-------|-----------|
| `GET /.well-known/x402` | The x402 discovery manifest: every resource, its price, its output schema, and both accepted payment rails. |
| [`skill.md`](https://github.com/nirholas/x402-events/blob/main/skill.md) | The agent-facing skill file: prose an LLM can read directly to learn the endpoints, parameters, and payment flow. |
| [`openapi.json`](https://github.com/nirholas/x402-events/blob/main/openapi.json) | OpenAPI 3.1, including the 402 `PaymentRequirements` schema. |

```bash
curl -s http://localhost:4023/.well-known/x402 | jq '.resources[] | {resource, price, networks}'
```

```json
{
  "resource": "GET /search",
  "price": "$0.003",
  "networks": ["base-sepolia", "solana"]
}
```

## 2. Pay — on either rail

**Pay in USDC on Base or Solana; your client picks the rail.** An unpaid request
returns 402 with an `accepts` array containing one entry per rail:

```jsonc
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",          // "base" on mainnet
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",   // USDC
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxAmountRequired": "3000",             // 6 decimals
      "extra": { "name": "USDC", "version": "2" }   // EIP-712 domain
    },
    {
      "scheme": "exact",
      "network": "solana",                 // "solana-devnet" on devnet
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  // USDC mint
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxAmountRequired": "3000",
      "extra": { "feePayer": "<facilitator sponsor>" }  // pays the SOL fee
    }
  ]
}
```

**EVM path.** Sign an EIP-3009 `transferWithAuthorization`. Entirely
client-side; no gas from the payer. `x402-fetch` does it in two lines:

```ts
import { createSigner, wrapFetchWithPayment } from "x402-fetch";
const payFetch = wrapFetchWithPayment(fetch, await createSigner("base-sepolia", KEY));
const artifact = await (await payFetch("${BASE}/search?keyword=jazz&city=Chicago&countryCode=US&size=2")).json();
```

**Solana path.** Build an SPL `transferChecked` to `payTo` for
`maxAmountRequired`, using `extra.feePayer` as the transaction fee payer, and
sign it. The buyer needs USDC only — the facilitator sponsors the SOL fee.
Base64-encode `{ x402Version: 1, scheme: "exact", network, payload: { transaction } }`
into `X-PAYMENT`.

Either way the server verifies and settles through the facilitator at
`https://x402.org/facilitator` and returns the artifact.

## 3. Read the receipt

Successful responses carry `X-PAYMENT-RESPONSE` — base64 JSON:

```json
{ "success": true, "rail": "solana", "network": "solana",
  "transaction": "<signature>", "payer": "<buyer>",
  "amount": "3000", "asset": "USDC" }
```

Log it: it is your proof of spend, on whichever chain you used.

## 4. What you get back

- `GET /search` (**$0.003**) — Events with venue, local and UTC start times, status, genre, price ranges and a ticket link
- `GET /onsale-check/:eventId` (**$0.002**) — A complete on-sale snapshot — state, public and presale windows, price ranges, ticket link, and a fresh cursor — plus the field-by-field delta since the cursor you sent

Nothing is deferred. The artifact is in the body of the 200 you paid for.

## 5. MCP integration

[`examples/mcp-tool.md`](https://github.com/nirholas/x402-events/blob/main/examples/mcp-tool.md)
has a complete MCP server that exposes these routes as Claude tools, including a
spend cap so a runaway loop cannot drain the wallet.

## 6. Listing an instance

Deployed your own? Make it discoverable:

- **[x402scan.com](https://x402scan.com)** — crawls `/.well-known/x402`. Submit
  your base URL; keep the manifest at that exact path.
- **x402 Bazaar** — the facilitator's resource directory. Resources are listed
  from the `discoverable` flag in the 402 `outputSchema.input` (set by default
  here).
- **[agentic.market](https://agentic.market)** — agent-facing service catalog;
  submit the base URL plus a link to `skill.md`.

Keep `/.well-known/x402`, `skill.md`, and `openapi.json` consistent when you
change prices — indexers read all three.

## Questions

nichxbt@gmail.com · <https://github.com/nirholas/x402-events>
