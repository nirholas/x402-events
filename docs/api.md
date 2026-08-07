# API reference — x402-events

Base URL: `http://localhost:4023` in development.
Machine-readable: [`openapi.json`](https://github.com/nirholas/x402-events/blob/main/openapi.json) (OpenAPI 3.1).

All paid routes return the purchased artifact in the **200 response body**.

## Payment

Every paid route answers an unpaid request with **402** and an `accepts` array
holding both rails:

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Prices are quoted in USDC base units (6 decimals) as `maxAmountRequired`.
On success the response carries `X-PAYMENT-RESPONSE`: base64 JSON with
`{ success, rail, network, transaction, payer, amount, asset }`.

---

## `GET /search`

**$0.003** — Search real events by keyword, city, country and start date

### Parameters

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `keyword` | query | no | string | Free-text search across event, attraction and venue names. |
| `city` | query | no | string | City name, e.g. `Chicago`. |
| `countryCode` | query | no | string | Two-letter ISO country code, e.g. `US`, `GB`. |
| `startDateTime` | query | no | string | Only events starting at or after this UTC instant, `YYYY-MM-DDTHH:MM:SSZ`. |
| `size` | query | no | integer | Maximum results, 1…50. Default 10. |

### Example request

```bash
curl -s "http://localhost:4023/search?keyword=jazz&city=Chicago&countryCode=US&size=2" -H "X-PAYMENT: <base64 payload>"
```

### Response `200 application/json`

`source` is `"ticketmaster"` for live inventory or `"fixture"` for the deterministic demo data. Each event `id` can be passed straight to `/onsale-check/:eventId`.

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

### Errors

| HTTP | `error` | When |
|------|---------|------|
| 400 | `missing_query` | None of `keyword`, `city` or `countryCode` was supplied — the search must be bounded. |
| 400 | `invalid_size` | `size` outside 1…50. |
| 400 | `invalid_country_code` | `countryCode` is not a two-letter ISO code. |
| 400 | `invalid_start_date_time` | `startDateTime` is not `YYYY-MM-DDTHH:MM:SSZ`. |
| 402 | — | No or invalid `X-PAYMENT`. Body carries `accepts` with both rails. |
| 502 | `upstream_error` | The upstream data source failed or timed out. |

---

## `GET /onsale-check/:eventId`

**$0.002** — Current on-sale snapshot for one event, plus a delta against your cursor

### Parameters

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `eventId` | path | yes | string | Event id as returned by `/search` (a Ticketmaster id, or a `FIX…` id in fixture mode). |
| `cursor` | query | no | string | The `snapshot.cursor` from a previous call. Supplying it populates `delta`. |

### Example request

```bash
curl -s "http://localhost:4023/onsale-check/FIX1RW2TPK1" -H "X-PAYMENT: <base64 payload>"
```

### Response `200 application/json`

Pay-per-poll: the snapshot is always complete and usable on its own. `delta` is `null` on the first call and, once you pass `?cursor=…`, lists exactly which fields moved. Keep `snapshot.cursor` for the next poll — it is a stateless base64url digest of the snapshot (the server stores nothing), so it is long; it is abbreviated with `…` in the example above.

```json
{
  "source": "fixture",
  "snapshot": {
    "eventId": "FIX1RW2TPK1",
    "eventName": "Nova Quartet — Seattle",
    "state": "not_yet_onsale",
    "status": "onsale",
    "publicSale": {
      "type": "public",
      "name": null,
      "startDateTime": "2026-10-17T20:00:00.000Z",
      "endDateTime": "2026-12-29T20:00:00.000Z"
    },
    "presales": [
      {
        "type": "presale",
        "name": "Fan Club Presale",
        "startDateTime": "2026-10-10T20:00:00.000Z",
        "endDateTime": "2026-10-17T20:00:00.000Z"
      }
    ],
    "priceRanges": [
      {
        "type": "standard",
        "currency": "USD",
        "min": 45,
        "max": 217
      }
    ],
    "url": "https://example.com/event/FIX1RW2TPK1",
    "cursor": "eyJzIjoibm90X3lldF9vbnNhbGUiLCJzdCI6Im9uc2Fs…",
    "observedAt": "2026-08-07T02:50:56.084Z"
  },
  "delta": {
    "unchanged": true,
    "changes": [],
    "since": "eyJzIjoibm90X3lldF9vbnNhbGUiLCJzdCI6Im9uc2Fs…"
  },
  "retrievedAt": "2026-08-07T02:50:56.084Z"
}
```

### Errors

| HTTP | `error` | When |
|------|---------|------|
| 400 | `invalid_event_id` | `eventId` is not a plausible event id. |
| 404 | `not_found` | No event with that id. In fixture mode only `FIX…`-shaped ids resolve — fixture events are generated deterministically from the id, so any well-formed `FIX…` id is a valid demo event. |
| 402 | — | No or invalid `X-PAYMENT`. Body carries `accepts` with both rails. |
| 502 | `upstream_error` | The upstream data source failed or timed out. |


---

## Free routes

### `GET /`

Service metadata: description, live prices, active payment rails, data-source
status, and docs links.

### `GET /health`

```json
{ "status": "ok", "uptime": 12.5 }
```

### `GET /.well-known/x402`

The discovery manifest — every resource with its price, output schema, and both
accepted rails. See [agents.md](agents.md).
