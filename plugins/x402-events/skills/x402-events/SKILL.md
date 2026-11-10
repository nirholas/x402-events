---
name: x402-events
description: Call the x402-events HTTP service to search events by keyword, city or country and to check an event's on-sale state with a delta against a prior cursor. Use when an agent needs live ticketing data for planning.
---

# x402-events

x402-events is an Express service over the Ticketmaster Discovery API. It returns events with venues, dates, price ranges and ticket links, and a current on-sale snapshot for one event. Callers pay per request in USDC over x402.

## Run it

No package is published and there is no hosted instance, so run it from a clone: `git clone https://github.com/nirholas/x402-events && cd x402-events`, then `npm install`, `cp .env.example .env`, and `npm run dev` (tsx `src/server.ts`). It listens on `PORT`, default 4023. For production use `npm run build` then `npm start`.

Key env vars: `PORT`, `TICKETMASTER_API_KEY` (free consumer key; when unset the service serves fixture data, so set it for real results), `TICKETMASTER_BASE_URL`, `TICKETMASTER_TIMEOUT_MS`, `PUBLIC_BASE_URL`, `PAY_TO_ADDRESS`, `SOLANA_PAY_TO_ADDRESS`, `NETWORK`, `SOLANA_NETWORK`.

## Endpoints

- `GET /search` ($0.003). Query: `keyword`, `city`, `countryCode` (two-letter ISO, for example `US`), `startDateTime`, `size` (1 to 50, default 10). At least one of `keyword`, `city` or `countryCode` is required, otherwise 400 `missing_query`. Other errors: `invalid_size`, `invalid_country_code`.
- `GET /onsale-check/:eventId` ($0.002). `eventId` is an id returned by `/search` (1 to 64 chars of `[A-Za-z0-9_-]`). Returns the on-sale state, public and presale windows and price ranges, plus a delta against the optional `cursor` query value from your previous call. 404 `not_found` for an unknown event. Keep the cursor from each response to poll for changes.
- `GET /health`, `GET /.well-known/x402`, `GET /` (free).

Example: `GET {BASE_URL}/search?keyword=jazz&city=Austin&size=5`, then `GET {BASE_URL}/onsale-check/<id from the results>`. Each call is paid separately, so search once, pick an event, then check it.

## Paying

Every paid route answers an unpaid request with HTTP 402 and a body whose `accepts` array lists two rails: USDC on Base (`base-sepolia` by default, `base` via `NETWORK`) and USDC on Solana (`solana` by default, `solana-devnet` via `SOLANA_NETWORK`). Pick the entry your wallet can sign, sign the USDC payment (EIP-3009 on Base, SPL `transferChecked` on Solana), and retry with the base64 `X-PAYMENT` header. The artifact is in the 200 body and the settlement receipt is in the `X-PAYMENT-RESPONSE` header. On the EVM rail `x402-fetch` with `viem` does this for you; `npm run client` runs `examples/agent-client.ts`, which reads `BASE_URL` and `PRIVATE_KEY`.

Discovery: `GET /.well-known/x402` lists routes, prices and rails, and `GET /skill.md` serves the repo's own reference. Paying moves real USDC on the configured network, so show the user the route, amount and rail first and wait for a yes before any paid call. Use a throwaway wallet on `base-sepolia` or `solana-devnet` for testing.
