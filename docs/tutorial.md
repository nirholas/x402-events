# Tutorial — x402-events

From a clean checkout to a paid API call, on either payment rail.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-events
cd x402-events
npm install
```

Node 18 or newer.

## 2. Configure (optional)

```bash
cp .env.example .env
```

Nothing is required. Out of the box the server:

- listens on port `4023`,
- accepts USDC on **Base Sepolia** and on **Solana**, paying out to the suite's
  public receive addresses,
- serves deterministic fixture events (no Ticketmaster key needed).

To be paid yourself, change these two lines:

```bash
PAY_TO_ADDRESS=0xYourEvmAddress
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress
```

To return **live** Ticketmaster inventory, register a free app at
<https://developer.ticketmaster.com> and copy the Consumer Key:

```bash
TICKETMASTER_API_KEY=your_consumer_key
```

Responses then come back with `"source": "ticketmaster"` instead of
`"source": "fixture"`. Everything else — routes, prices, payment — is identical.

## 3. Run the server

```bash
npm run dev
```

```
x402-events v0.1.0 listening on :4023
  payment rails:
    EVM     base-sepolia  USDC → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402
    Solana  solana         USDC → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
  facilitator: https://x402.org/facilitator
  paid routes:
    GET /search                  $0.003
    GET /onsale-check/:eventId   $0.002
  free routes: GET /, GET /health, GET /.well-known/x402
```

Check it is alive:

```bash
curl -s http://localhost:4023/health
# {"status":"ok","uptime":1.2}
```

## 4. Your first 402

```bash
curl -s "http://localhost:4023/search?keyword=jazz&city=Chicago&countryCode=US&size=2" | jq
```

You get HTTP **402** and a challenge listing **both** rails:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "3000",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "3000",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }
  ]
}
```

That is the whole price negotiation: no key, no signup, no account. The price
is `3000` USDC base units (6 decimals) = **$0.003**.

## 5. Pay for real

Get a Base Sepolia test wallet and fund it with test USDC from
<https://faucet.circle.com>. Then:

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

[`examples/agent-client.ts`](../examples/agent-client.ts) does the full flow:

1. Calls the route unpaid and prints both rails from the 402.
2. Signs an EIP-3009 USDC authorization for exactly $0.003.
3. Retries with the `X-PAYMENT` header.
4. Prints the artifact and decodes the `X-PAYMENT-RESPONSE` receipt.

Prefer Solana? The bottom of that file shows the equivalent flow — the server
needs no changes, since the same 402 already advertises the `solana` rail.

## 6. Read the artifact

The 200 body **is** the purchase:

```json
{
  "source": "fixture",
  "query": {
    "keyword": "jazz",
    "city": "Chicago",
    "countryCode": "US",
    "startDateTime": null,
    "size": 2
  },
  "count": 2,
  "events": [
    {
      "id": "FIX1RW2TPK1",
      "name": "Nova Quartet — Seattle",
      "url": "https://example.com/event/FIX1RW2TPK1",
      "startLocal": "2026-12-29T20:00:00",
      "startUtc": "2026-12-29T20:00:00.000Z",
      "timezone": "America/Chicago",
      "status": "onsale",
      "segment": "Music",
      "genre": "Classical",
      "venue": {
        "name": "Northgate Hall",
        "city": "Seattle",
        "state": "Washington",
        "country": "United States Of America",
        "address": "305 Harrison St",
        "latitude": 47.6216,
        "longitude": -122.3517
      },
      "priceRanges": [
        {
          "type": "standard",
          "currency": "USD",
          "min": 45,
          "max": 217
        }
      ],
      "images": [
        "https://example.com/img/FIX1RW2TPK1.jpg"
      ]
    },
    {
      "id": "FIX1RW2TPK2",
      "name": "Harbour Jazz Nights — Chicago",
      "url": "https://example.com/event/FIX1RW2TPK2",
      "startLocal": "2026-09-29T20:00:00",
      "startUtc": "2026-09-29T20:00:00.000Z",
      "timezone": "America/Chicago",
      "status": "onsale",
      "segment": "Music",
      "genre": "Jazz",
      "venue": {
        "name": "Riverside Arena",
        "city": "Chicago",
        "state": "Illinois",
        "country": "United States Of America",
        "address": "1901 W Madison St",
        "latitude": 41.8807,
        "longitude": -87.6742
      },
      "priceRanges": [
        {
          "type": "standard",
          "currency": "USD",
          "min": 45,
          "max": 245
        }
      ],
      "images": [
        "https://example.com/img/FIX1RW2TPK2.jpg"
      ]
    }
  ],
  "retrievedAt": "2026-08-07T02:50:56.083Z"
}
```

Check `source` first: `"ticketmaster"` means live inventory, `"fixture"` means
the deterministic demo data. Each event carries a `url` you can hand to a user,
and its `id` works directly on `/onsale-check/:eventId`.

The on-sale route is the interesting one for agents. Call it once with no
cursor to get a snapshot; keep `snapshot.cursor`; pass it back as
`?cursor=…` next time and the response tells you exactly which fields moved:

```json
"delta": { "unchanged": false, "changes": [
  { "field": "state", "from": "\"not_yet_onsale\"", "to": "\"onsale\"" }
], "since": "eyJzIjoi…" }
```

Full field-by-field reference: [api.md](api.md).

## 7. Going to mainnet

```bash
# EVM: Base mainnet
NETWORK=base
PAY_TO_ADDRESS=0xYourRealAddress

# Solana: mainnet (this is already the default)
SOLANA_NETWORK=mainnet-beta
SOLANA_PAY_TO_ADDRESS=YourRealSolanaAddress
SOLANA_RPC_URL=https://your-dedicated-rpc.example.com

# A facilitator that settles on the networks you accept
FACILITATOR_URL=https://x402.org/facilitator
```

Then run `npm run build && npm start`. Nothing else changes: the same routes,
the same prices, real USDC.

> Use a dedicated Solana RPC in production. The public endpoint is heavily
> rate-limited.

## Where to go next

- [api.md](api.md) — every endpoint, parameter, and error
- [agents.md](agents.md) — discovery, MCP, and listing your instance
- [../skill.md](https://github.com/nirholas/x402-events/blob/main/skill.md) — the agent-facing skill file
- [../examples/curl.md](https://github.com/nirholas/x402-events/blob/main/examples/curl.md) — the same flow in raw curl
