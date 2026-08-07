/**
 * Per-route request/response schemas published in the x402 402 challenge.
 *
 * GENERATED from `openapi.json` — the runtime challenge and the OpenAPI
 * document must agree, and the runtime is authoritative for x402scan
 * discovery. Regenerate rather than hand-editing.
 *
 * Shape follows the x402 Bazaar convention:
 *   `input`  — how to call the route (`type: "http"`, method, query params /
 *              JSON body fields)
 *   `output` — the JSON-Schema of the 200 response body.
 *
 * Keys match the paywall route map in `src/server.ts` exactly.
 */

export type RouteSchema = {
  /** How an agent invokes this route. */
  input: Record<string, unknown>;
  /** JSON-Schema of the artifact returned in the 200 body. */
  output: Record<string, unknown>;
};

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "GET /search": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "keyword": {
          "type": "string",
          "description": "Free-text search across event, attraction and venue names.",
          "example": "jazz"
        },
        "city": {
          "type": "string",
          "description": "City name, e.g. `Chicago`.",
          "example": "Chicago"
        },
        "countryCode": {
          "type": "string",
          "description": "Two-letter ISO country code, e.g. `US`, `GB`.",
          "example": "US"
        },
        "startDateTime": {
          "type": "string",
          "description": "Only events starting at or after this UTC instant, `YYYY-MM-DDTHH:MM:SSZ`.",
          "example": "2026-09-01T00:00:00Z"
        },
        "size": {
          "type": "integer",
          "description": "Maximum results, 1…50. Default 10.",
          "example": 2
        }
      }
    },
    "output": {
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
  },
  "GET /onsale-check/:eventId": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "cursor": {
          "type": "string",
          "description": "The `snapshot.cursor` from a previous call. Supplying it populates `delta`.",
          "example": "eyJzIjoib25zYWxlIn0"
        }
      }
    },
    "output": {
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
  }
};
