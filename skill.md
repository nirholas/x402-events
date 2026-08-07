# x402-events — agent skill

Find real events — concerts, sports, theatre — and check whether a specific event
is on sale right now. Search returns events with venues, dates, statuses and
price ranges. The on-sale route returns a complete snapshot of one event's sales
lifecycle (public window, presales, price ranges, current state) plus a
field-by-field delta against a cursor you got from a previous call, so polling
is cheap and every poll still delivers a usable artifact. Backed by the
Ticketmaster Discovery API when a key is configured, deterministic fixtures
otherwise (always labelled in `source`).

**Base URL:** `{BASE_URL}` (local default `http://localhost:4023`)

Every paid call returns the purchased artifact **in the 200 response body**.
There is nothing to poll and nothing to collect later.

## Payment

This service speaks **x402** (HTTP 402 Payment Required, <https://x402.org>).

**Pay in USDC on Base or Solana — your client picks the rail.**

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Facilitator: `https://x402.org/facilitator` (verifies and settles both rails).

Flow:

1. Call the endpoint with no `X-PAYMENT` header. You get **402** with an
   `accepts` array holding **both** rails.
2. Pick a rail, sign the payment, and put the base64 payload in `X-PAYMENT`.
3. Repeat the request. You get **200** with the artifact, and a settlement
   receipt in the `X-PAYMENT-RESPONSE` header (base64 JSON:
   `{ success, rail, network, transaction, payer, amount, asset }`).

Use `x402-fetch` (EVM), a Solana x402 client, or any x402-aware HTTP client —
the wire format is the standard one.

```ts
import { wrapFetchWithPayment, createSigner } from "x402-fetch";
const signer = await createSigner("base-sepolia", process.env.PRIVATE_KEY!);
const pay = wrapFetchWithPayment(fetch, signer);
const res = await pay("{BASE_URL}/search?keyword=jazz&city=Chicago&countryCode=US&size=2");
const artifact = await res.json();
```

## Endpoints

### `GET /search` — $0.003

Search real events by keyword, city, country and start date

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `keyword` | query | no | string | Free-text search across event, attraction and venue names. |
| `city` | query | no | string | City name, e.g. `Chicago`. |
| `countryCode` | query | no | string | Two-letter ISO country code, e.g. `US`, `GB`. |
| `startDateTime` | query | no | string | Only events starting at or after this UTC instant, `YYYY-MM-DDTHH:MM:SSZ`. |
| `size` | query | no | integer | Maximum results, 1…50. Default 10. |

**Returns** (`200 application/json`) — Events with venue, local and UTC start times, status, genre, price ranges and a ticket link

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

<details><summary>Response schema</summary>

```json
{
  "type": "object",
  "required": [
    "source",
    "query",
    "count",
    "events",
    "retrievedAt"
  ],
  "properties": {
    "source": {
      "type": "string",
      "enum": [
        "ticketmaster",
        "fixture"
      ]
    },
    "query": {
      "type": "object",
      "properties": {
        "keyword": {
          "type": [
            "string",
            "null"
          ]
        },
        "city": {
          "type": [
            "string",
            "null"
          ]
        },
        "countryCode": {
          "type": [
            "string",
            "null"
          ]
        },
        "startDateTime": {
          "type": [
            "string",
            "null"
          ]
        },
        "size": {
          "type": "integer"
        }
      }
    },
    "count": {
      "type": "integer"
    },
    "retrievedAt": {
      "type": "string",
      "format": "date-time"
    },
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "name",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string",
            "description": "Pass to `/onsale-check/:eventId`."
          },
          "name": {
            "type": "string"
          },
          "url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri",
            "description": "Ticket page."
          },
          "startLocal": {
            "type": [
              "string",
              "null"
            ],
            "description": "Local start, `YYYY-MM-DDTHH:MM:SS` in venue time."
          },
          "startUtc": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "timezone": {
            "type": [
              "string",
              "null"
            ]
          },
          "status": {
            "type": "string",
            "description": "Upstream lifecycle code: `onsale`, `offsale`, `cancelled`, …"
          },
          "segment": {
            "type": [
              "string",
              "null"
            ],
            "description": "Top-level classification, e.g. Music, Sports."
          },
          "genre": {
            "type": [
              "string",
              "null"
            ]
          },
          "venue": {
            "type": [
              "object",
              "null"
            ],
            "properties": {
              "name": {
                "type": "string"
              },
              "city": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "state": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "country": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "address": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "latitude": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "longitude": {
                "type": [
                  "number",
                  "null"
                ]
              }
            }
          },
          "priceRanges": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string"
                },
                "currency": {
                  "type": "string"
                },
                "min": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "max": {
                  "type": [
                    "number",
                    "null"
                  ]
                }
              }
            }
          },
          "images": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "uri"
            }
          }
        }
      }
    }
  }
}
```

</details>

---

### `GET /onsale-check/:eventId` — $0.002

Current on-sale snapshot for one event, plus a delta against your cursor

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `eventId` | path | yes | string | Event id as returned by `/search` (a Ticketmaster id, or a `FIX…` id in fixture mode). |
| `cursor` | query | no | string | The `snapshot.cursor` from a previous call. Supplying it populates `delta`. |

**Returns** (`200 application/json`) — A complete on-sale snapshot — state, public and presale windows, price ranges, ticket link, and a fresh cursor — plus the field-by-field delta since the cursor you sent

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

<details><summary>Response schema</summary>

```json
{
  "type": "object",
  "required": [
    "source",
    "snapshot",
    "delta",
    "retrievedAt"
  ],
  "properties": {
    "source": {
      "type": "string",
      "enum": [
        "ticketmaster",
        "fixture"
      ]
    },
    "retrievedAt": {
      "type": "string",
      "format": "date-time"
    },
    "snapshot": {
      "type": "object",
      "required": [
        "eventId",
        "state",
        "status",
        "cursor",
        "observedAt"
      ],
      "properties": {
        "eventId": {
          "type": "string"
        },
        "eventName": {
          "type": "string"
        },
        "state": {
          "type": "string",
          "enum": [
            "onsale",
            "presale",
            "not_yet_onsale",
            "offsale",
            "unknown"
          ],
          "description": "Where the event sits in its sales lifecycle right now."
        },
        "status": {
          "type": "string",
          "description": "Raw upstream status code."
        },
        "publicSale": {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": [
                "public",
                "presale"
              ]
            },
            "name": {
              "type": [
                "string",
                "null"
              ]
            },
            "startDateTime": {
              "type": [
                "string",
                "null"
              ],
              "format": "date-time"
            },
            "endDateTime": {
              "type": [
                "string",
                "null"
              ],
              "format": "date-time"
            }
          }
        },
        "presales": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "public",
                  "presale"
                ]
              },
              "name": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "startDateTime": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              },
              "endDateTime": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              }
            }
          }
        },
        "priceRanges": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string"
              },
              "currency": {
                "type": "string"
              },
              "min": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "max": {
                "type": [
                  "number",
                  "null"
                ]
              }
            }
          }
        },
        "url": {
          "type": [
            "string",
            "null"
          ],
          "format": "uri"
        },
        "cursor": {
          "type": "string",
          "description": "Opaque digest of this snapshot. Send it back as `?cursor=` to get a delta."
        },
        "observedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "delta": {
      "type": [
        "object",
        "null"
      ],
      "description": "Null when no cursor was supplied.",
      "properties": {
        "unchanged": {
          "type": "boolean"
        },
        "since": {
          "type": [
            "string",
            "null"
          ]
        },
        "changes": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "field": {
                "type": "string",
                "enum": [
                  "state",
                  "status",
                  "publicSale",
                  "presales",
                  "priceRanges"
                ]
              },
              "from": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "to": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    }
  }
}
```

</details>


## Free endpoints

- `GET /` — Service metadata, live prices, active payment rails, backend status
- `GET /health` — Liveness probe
- `GET /.well-known/x402` — Machine-readable discovery manifest

## Error codes

| HTTP | `error` | Meaning |
|------|---------|---------|
| 400 | `missing_query` | None of `keyword`, `city` or `countryCode` was supplied. |
| 400 | `invalid_size` | `size` outside 1…50. |
| 400 | `invalid_country_code` | `countryCode` is not a two-letter ISO code. |
| 400 | `invalid_start_date_time` | `startDateTime` is not `YYYY-MM-DDTHH:MM:SSZ`. |
| 400 | `invalid_event_id` | `eventId` is not a plausible event id. |
| 404 | `not_found` | No event with that id. In fixture mode only `FIX…`-shaped ids resolve, since fixture events are generated deterministically from the id itself. |
| 502 | `upstream_error` | Ticketmaster rejected the request or timed out. |
| 402 | — | Payment required or rejected. Body carries `accepts` (both rails) and an `error` reason. |
| 500 | `no_payment_rail_configured` | Server has neither a valid EVM nor Solana payTo. |

## Data source

Live [Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
data when `TICKETMASTER_API_KEY` is set (`source: "ticketmaster"`). The consumer
key is free. Without it, the service returns deterministic fixture events
(`source: "fixture"`) — the same query always yields the same events, and
fixture event ids (`FIX…`) work on `/onsale-check` too, so the whole flow is
demonstrable with no credentials. Always check `source` before treating results
as real inventory.

## Discovery

Machine-readable manifest: **`GET /.well-known/x402`**
(also at <https://github.com/nirholas/x402-events/blob/main/public/.well-known/x402>).
Indexed by [x402scan.com](https://x402scan.com), the x402 Bazaar, and
[agentic.market](https://agentic.market).

OpenAPI 3.1: [`openapi.json`](https://github.com/nirholas/x402-events/blob/main/openapi.json)

## Contact

nichxbt@gmail.com · <https://github.com/nirholas/x402-events>
