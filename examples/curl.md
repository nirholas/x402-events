# Raw HTTP walkthrough — 402 → pay → 200

Everything below is plain `curl`. No SDK required.

## 0. Start the server

```bash
npm install
npm run dev      # http://localhost:4023
```

## 1. Free routes need no payment

```bash
curl -s http://localhost:4023/health
curl -s http://localhost:4023/ | jq
curl -s http://localhost:4023/.well-known/x402 | jq
```

## 2. Call a paid route with no payment → 402, both rails

```bash
curl -s -i "http://localhost:4023/search?keyword=jazz&city=Chicago&countryCode=US&size=2"
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "hint": "Pay in USDC on Base or Solana — your client picks the rail. See /.well-known/x402",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "3000",
      "resource": "http://localhost:4023/search",
      "description": "Search real events by keyword, city, country and start date",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "3000",
      "resource": "http://localhost:4023/search",
      "description": "Search real events by keyword, city, country and start date",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": { "name": "USDC", "decimals": 6, "feePayer": "<facilitator sponsor>" }
    }
  ]
}
```

`maxAmountRequired` is in USDC base units (6 decimals): `3000` = $0.003.

## 3. Build the payment

Pick **one** entry from `accepts`.

**EVM (Base):** sign an EIP-3009 `transferWithAuthorization` for
`maxAmountRequired` USDC to `payTo`. No gas needed from you — the facilitator
submits it.

**Solana:** build an SPL `transferChecked` of `maxAmountRequired` USDC to
`payTo`, with `extra.feePayer` as the transaction fee payer, and sign it. You
need USDC only — the facilitator sponsors the SOL fee.

Either way, base64-encode the x402 payload:

```json
{ "x402Version": 1, "scheme": "exact", "network": "<the rail you picked>", "payload": { … } }
```

In practice, let a library do it:

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

## 4. Repeat the request with the header → 200 + artifact

```bash
curl -s -i "http://localhost:4023/search?keyword=jazz&city=Chicago&countryCode=US&size=2" \
  -H "X-PAYMENT: <base64 payload>"
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJyYWlsIjoiZXZtIiwi…
```

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

Decode the receipt:

```bash
echo '<X-PAYMENT-RESPONSE value>' | base64 -d | jq
# { "success": true, "rail": "evm", "network": "base-sepolia",
#   "transaction": "0x…", "payer": "0x…", "amount": "3000", "asset": "USDC" }
```

The artifact is in the body of that same 200. There is nothing else to fetch.

## All paid routes

```bash
curl -s "http://localhost:4023/search?keyword=jazz&city=Chicago&countryCode=US&size=2" -H "X-PAYMENT: <payload>"   # $0.003
```

```bash
curl -s "http://localhost:4023/onsale-check/FIX1RW2TPK1" -H "X-PAYMENT: <payload>"   # $0.002
```
