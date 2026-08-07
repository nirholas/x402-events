/**
 * x402-events — Express server with the dual-rail x402 paywall.
 *
 * Event search and on-sale checks over Ticketmaster Discovery. Paid routes
 * return the purchased artifact directly in the 200 response body — the
 * on-sale route is pay-per-poll: every call returns a complete snapshot, plus
 * a delta against the caller's cursor when one is supplied.
 *
 * Buyers pay in USDC on Base (EVM) or on Solana; the 402 challenge advertises
 * both rails and the client picks.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  facilitatorUrl,
  paywall,
  rails,
  solanaCheckoutRouter,
  usingSuiteDefaultPayTo,
  type RoutePrices,
} from "./payments.js";
import { hasTicketmasterKey, onSaleCheck, searchEvents } from "./service.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

/** Paid routes. Anything not listed here is free. */
const ROUTES: RoutePrices = {
  "GET /search": {
    price: "$0.003",
    description:
      "Event search over Ticketmaster Discovery. Returns events with venues, dates, price ranges and ticket links.",
    outputSchema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["ticketmaster", "fixture"] },
        count: { type: "integer" },
        events: { type: "array", items: { type: "object" } },
      },
    },
  },
  "GET /onsale-check/:eventId": {
    price: "$0.002",
    description:
      "Current on-sale snapshot for one event — sale state, public and presale windows, price ranges — plus a delta against the caller's cursor.",
    outputSchema: {
      type: "object",
      properties: {
        snapshot: { type: "object" },
        delta: { type: ["object", "null"] },
      },
    },
  },
};

const app = express();
app.disable("x-powered-by");
app.use(express.json());

// Dual-rail x402 paywall: USDC on Base or Solana.
app.use(paywall(ROUTES, { service: "x402-events" }));

// Optional: browser (Phantom) Solana checkout helper.
const checkoutRouter = await solanaCheckoutRouter();
if (checkoutRouter) app.use("/api/x402-checkout", checkoutRouter);

// Discovery manifest — before express.static so it keeps an explicit JSON type.
app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json").sendFile(join(publicDir, ".well-known", "x402"));
});

app.use(express.static(publicDir));

// Free: service info.
app.get("/", (_req, res) => {
  res.json({
    name: "x402-events",
    description:
      "Event search and on-sale checks over Ticketmaster Discovery — agents find real events and ticket windows",
    payment: {
      protocol: "x402",
      note: "Pay in USDC on Base or Solana — your client picks the rail.",
      facilitator: facilitatorUrl(),
      rails: rails(),
    },
    backend: hasTicketmasterKey()
      ? { source: "ticketmaster", live: true }
      : {
          source: "fixture",
          live: false,
          note: "Set TICKETMASTER_API_KEY (free consumer key) for live event data.",
        },
    routes: {
      "GET /search": {
        price: "$0.003",
        params: "keyword, city, countryCode, startDateTime, size (1-50, default 10)",
        returns: "events with venues, dates, price ranges and ticket links",
      },
      "GET /onsale-check/:eventId": {
        price: "$0.002",
        params: "cursor (optional — the cursor from a previous snapshot)",
        returns: "current on-sale snapshot + delta vs the caller's cursor",
      },
      "GET /health": { price: "free" },
      "GET /.well-known/x402": { price: "free" },
    },
    docs: "https://nirholas.github.io/x402-events/",
    skill: "https://github.com/nirholas/x402-events/blob/main/skill.md",
  });
});

// Free: health check.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Paid: $0.003 — event search. Artifact returned in this response body.
app.get("/search", async (req, res) => {
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

  const keyword = str(req.query.keyword);
  const city = str(req.query.city);
  const countryCode = str(req.query.countryCode);
  const startDateTime = str(req.query.startDateTime);
  const size = req.query.size != null ? Number(req.query.size) : 10;

  if (!keyword && !city && !countryCode) {
    res.status(400).json({
      error: "missing_query",
      message:
        "Supply at least one of 'keyword', 'city' or 'countryCode' so the search is bounded.",
    });
    return;
  }
  if (!Number.isFinite(size) || size < 1 || size > 50) {
    res.status(400).json({
      error: "invalid_size",
      message: "Query param 'size' must be an integer between 1 and 50.",
    });
    return;
  }
  if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode)) {
    res.status(400).json({
      error: "invalid_country_code",
      message: "Query param 'countryCode' must be a two-letter ISO code, e.g. US or GB.",
    });
    return;
  }
  if (startDateTime && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(startDateTime)) {
    res.status(400).json({
      error: "invalid_start_date_time",
      message:
        "Query param 'startDateTime' must look like 2026-09-01T00:00:00Z (UTC, seconds precision).",
    });
    return;
  }

  try {
    res.json(
      await searchEvents({
        keyword,
        city,
        countryCode: countryCode ? countryCode.toUpperCase() : null,
        startDateTime,
        size: Math.round(size),
      }),
    );
  } catch (err) {
    res.status(502).json({
      error: "upstream_error",
      message: err instanceof Error ? err.message : "Ticketmaster request failed",
    });
  }
});

// Paid: $0.002 — on-sale snapshot + delta. Artifact returned in this body.
app.get("/onsale-check/:eventId", async (req, res) => {
  const eventId = req.params.eventId;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(eventId)) {
    res.status(400).json({
      error: "invalid_event_id",
      message: "Path param 'eventId' must be an event id as returned by /search.",
    });
    return;
  }
  const cursor =
    typeof req.query.cursor === "string" && req.query.cursor.length > 0
      ? req.query.cursor
      : null;

  try {
    const result = await onSaleCheck(eventId, cursor);
    if (!result) {
      res.status(404).json({
        error: "not_found",
        message: `No event with id ${eventId}.`,
      });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: "upstream_error",
      message: err instanceof Error ? err.message : "Ticketmaster request failed",
    });
  }
});

const port = Number(process.env.PORT ?? 4023);
app.listen(port, () => {
  const pkg = require("../package.json") as { version: string };
  console.log(`x402-events v${pkg.version} listening on :${port}`);
  console.log("  payment rails:");
  for (const rail of rails()) {
    console.log(
      `    ${rail.rail === "evm" ? "EVM   " : "Solana"}  ${rail.network.padEnd(14)} ${rail.asset} → ${rail.payTo}`,
    );
  }
  console.log(`  facilitator: ${facilitatorUrl()}`);
  if (usingSuiteDefaultPayTo()) {
    console.log(
      "  note:        using suite default payTo — set PAY_TO_ADDRESS/SOLANA_PAY_TO_ADDRESS to receive funds yourself",
    );
  }
  console.log(
    `  backend:     ${hasTicketmasterKey() ? "Ticketmaster Discovery (live)" : "fixtures (set TICKETMASTER_API_KEY for live data)"}`,
  );
  console.log("  paid routes:");
  for (const [route, spec] of Object.entries(ROUTES)) {
    console.log(`    ${route.padEnd(28)} ${typeof spec === "string" ? spec : spec.price}`);
  }
  console.log("  free routes: GET /, GET /health, GET /.well-known/x402");
});
