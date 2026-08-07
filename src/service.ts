/**
 * x402-events — service layer.
 *
 * Live adapter for the Ticketmaster Discovery API, env-gated by
 * TICKETMASTER_API_KEY (free consumer key). When the key is absent the service
 * returns deterministic fixture data so the demo always runs without
 * credentials. Every response carries a `source` field: "ticketmaster" or
 * "fixture".
 */

export interface PriceRange {
  type: string;
  currency: string;
  min: number | null;
  max: number | null;
}

export interface Venue {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface EventRecord {
  id: string;
  name: string;
  url: string | null;
  /** ISO-8601 local start, e.g. "2026-09-14T20:00:00" (venue local time). */
  startLocal: string | null;
  /** ISO-8601 UTC start when the upstream knows the timezone. */
  startUtc: string | null;
  timezone: string | null;
  status: string;
  segment: string | null;
  genre: string | null;
  venue: Venue | null;
  priceRanges: PriceRange[];
  images: string[];
}

export interface EventSearchResult {
  source: "ticketmaster" | "fixture";
  query: {
    keyword: string | null;
    city: string | null;
    countryCode: string | null;
    startDateTime: string | null;
    size: number;
  };
  count: number;
  events: EventRecord[];
  retrievedAt: string;
}

/** One on-sale window as the upstream reports it. */
export interface SaleWindow {
  type: "public" | "presale";
  name: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
}

export type OnSaleState = "onsale" | "presale" | "not_yet_onsale" | "offsale" | "unknown";

export interface OnSaleSnapshot {
  eventId: string;
  eventName: string;
  /** Where the event is in its sales lifecycle right now. */
  state: OnSaleState;
  /** Event lifecycle status from the upstream: onsale / offsale / cancelled / … */
  status: string;
  publicSale: SaleWindow | null;
  presales: SaleWindow[];
  priceRanges: PriceRange[];
  url: string | null;
  /** Opaque cursor describing this snapshot. Pass it back to get a delta. */
  cursor: string;
  observedAt: string;
}

export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface OnSaleCheckResult {
  source: "ticketmaster" | "fixture";
  snapshot: OnSaleSnapshot;
  /** Difference against the caller's cursor, or null when none was supplied. */
  delta: {
    /** True when nothing observable changed since the caller's cursor. */
    unchanged: boolean;
    changes: FieldChange[];
    since: string | null;
  } | null;
  retrievedAt: string;
}

const TM_BASE =
  process.env.TICKETMASTER_BASE_URL ?? "https://app.ticketmaster.com/discovery/v2";

/** True when a Ticketmaster Discovery key is configured. */
export function hasTicketmasterKey(): boolean {
  return Boolean(process.env.TICKETMASTER_API_KEY);
}

// ---------------------------------------------------------------------------
// Cursor: a compact, self-describing digest of an on-sale snapshot.
// ---------------------------------------------------------------------------

/** Stable digest of the fields a caller would care about changing. */
function cursorFor(snap: Omit<OnSaleSnapshot, "cursor" | "observedAt">): string {
  const canonical = JSON.stringify({
    s: snap.state,
    st: snap.status,
    p: snap.publicSale,
    pre: snap.presales,
    pr: snap.priceRanges,
  });
  return Buffer.from(canonical, "utf8").toString("base64url");
}

/** Decodes a cursor produced by a previous call. Returns null when malformed. */
function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

const CHANGE_LABELS: Record<string, string> = {
  s: "state",
  st: "status",
  p: "publicSale",
  pre: "presales",
  pr: "priceRanges",
};

/** Field-by-field diff between the caller's cursor and the current snapshot. */
function diffCursors(previous: string, current: string): FieldChange[] {
  const a = decodeCursor(previous);
  const b = decodeCursor(current);
  if (!a || !b) return [];
  const changes: FieldChange[] = [];
  for (const key of Object.keys(CHANGE_LABELS)) {
    const from = JSON.stringify(a[key] ?? null);
    const to = JSON.stringify(b[key] ?? null);
    if (from !== to) {
      changes.push({ field: CHANGE_LABELS[key], from, to });
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Ticketmaster Discovery adapter
// ---------------------------------------------------------------------------

interface TmImage {
  url?: string;
  width?: number;
}
interface TmPriceRange {
  type?: string;
  currency?: string;
  min?: number;
  max?: number;
}
interface TmSaleWindow {
  startDateTime?: string;
  endDateTime?: string;
  name?: string;
}
interface TmEvent {
  id?: string;
  name?: string;
  url?: string;
  images?: TmImage[];
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  sales?: {
    public?: TmSaleWindow & { startTBD?: boolean };
    presales?: TmSaleWindow[];
  };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  priceRanges?: TmPriceRange[];
  _embedded?: {
    venues?: {
      name?: string;
      city?: { name?: string };
      state?: { name?: string };
      country?: { name?: string };
      address?: { line1?: string };
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

async function tmFetch(path: string, params: URLSearchParams): Promise<unknown> {
  params.set("apikey", process.env.TICKETMASTER_API_KEY ?? "");
  const res = await fetch(`${TM_BASE}${path}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(Number(process.env.TICKETMASTER_TIMEOUT_MS ?? 20_000)),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Ticketmaster request failed: ${res.status} ${detail}`);
  }
  return res.json();
}

function toPriceRanges(ranges: TmPriceRange[] | undefined): PriceRange[] {
  return (ranges ?? []).map((p) => ({
    type: p.type ?? "standard",
    currency: p.currency ?? "USD",
    min: p.min ?? null,
    max: p.max ?? null,
  }));
}

function toVenue(ev: TmEvent): Venue | null {
  const v = ev._embedded?.venues?.[0];
  if (!v) return null;
  return {
    name: v.name ?? "(unnamed venue)",
    city: v.city?.name ?? null,
    state: v.state?.name ?? null,
    country: v.country?.name ?? null,
    address: v.address?.line1 ?? null,
    latitude: v.location?.latitude != null ? Number(v.location.latitude) : null,
    longitude: v.location?.longitude != null ? Number(v.location.longitude) : null,
  };
}

function toEvent(ev: TmEvent): EventRecord {
  const start = ev.dates?.start;
  const startLocal =
    start?.localDate != null
      ? `${start.localDate}${start.localTime ? `T${start.localTime}` : ""}`
      : null;
  const cls = ev.classifications?.[0];
  return {
    id: ev.id ?? "unknown",
    name: ev.name ?? "(untitled event)",
    url: ev.url ?? null,
    startLocal,
    startUtc: start?.dateTime ?? null,
    timezone: ev.dates?.timezone ?? null,
    status: ev.dates?.status?.code ?? "unknown",
    segment: cls?.segment?.name ?? null,
    genre: cls?.genre?.name ?? null,
    venue: toVenue(ev),
    priceRanges: toPriceRanges(ev.priceRanges),
    images: (ev.images ?? [])
      .filter((i) => (i.width ?? 0) >= 600 && i.url)
      .slice(0, 3)
      .map((i) => i.url as string),
  };
}

/** Classifies where an event sits in its sales lifecycle right now. */
function classifyState(
  status: string,
  publicSale: SaleWindow | null,
  presales: SaleWindow[],
  now = Date.now(),
): OnSaleState {
  if (status === "offsale" || status === "cancelled") return "offsale";
  const within = (w: SaleWindow | null): boolean => {
    if (!w?.startDateTime) return false;
    const start = Date.parse(w.startDateTime);
    const end = w.endDateTime ? Date.parse(w.endDateTime) : Number.POSITIVE_INFINITY;
    return Number.isFinite(start) && now >= start && now <= end;
  };
  if (within(publicSale)) return "onsale";
  if (presales.some(within)) return "presale";
  if (publicSale?.startDateTime && Date.parse(publicSale.startDateTime) > now) {
    return "not_yet_onsale";
  }
  if (status === "onsale") return "onsale";
  return "unknown";
}

function toSnapshot(ev: TmEvent): Omit<OnSaleSnapshot, "cursor" | "observedAt"> {
  const publicSale: SaleWindow | null = ev.sales?.public
    ? {
        type: "public",
        name: null,
        startDateTime: ev.sales.public.startDateTime ?? null,
        endDateTime: ev.sales.public.endDateTime ?? null,
      }
    : null;
  const presales: SaleWindow[] = (ev.sales?.presales ?? []).map((p) => ({
    type: "presale" as const,
    name: p.name ?? null,
    startDateTime: p.startDateTime ?? null,
    endDateTime: p.endDateTime ?? null,
  }));
  const status = ev.dates?.status?.code ?? "unknown";
  return {
    eventId: ev.id ?? "unknown",
    eventName: ev.name ?? "(untitled event)",
    state: classifyState(status, publicSale, presales),
    status,
    publicSale,
    presales,
    priceRanges: toPriceRanges(ev.priceRanges),
    url: ev.url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fixture data — used when TICKETMASTER_API_KEY is unset.
// Deterministic: the same query always produces the same events.
// ---------------------------------------------------------------------------

function seedFrom(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIXTURE_ACTS = [
  { name: "The Midnight Signal", segment: "Music", genre: "Rock" },
  { name: "Solar Fields Live", segment: "Music", genre: "Electronic" },
  { name: "Nova Quartet", segment: "Music", genre: "Classical" },
  { name: "City Rivals Derby", segment: "Sports", genre: "Football" },
  { name: "Standup Marathon", segment: "Arts & Theatre", genre: "Comedy" },
  { name: "Northern Lights Festival", segment: "Music", genre: "Indie" },
  { name: "The Glass Orchestra", segment: "Arts & Theatre", genre: "Theatre" },
  { name: "Harbour Jazz Nights", segment: "Music", genre: "Jazz" },
];

const FIXTURE_VENUES = [
  { name: "Riverside Arena", city: "Chicago", state: "Illinois", country: "United States Of America", address: "1901 W Madison St", latitude: 41.8807, longitude: -87.6742 },
  { name: "The Foundry", city: "Austin", state: "Texas", country: "United States Of America", address: "310 Red River St", latitude: 30.2669, longitude: -97.7365 },
  { name: "Northgate Hall", city: "Seattle", state: "Washington", country: "United States Of America", address: "305 Harrison St", latitude: 47.6216, longitude: -122.3517 },
  { name: "Bayfront Pavilion", city: "Miami", state: "Florida", country: "United States Of America", address: "301 Biscayne Blvd", latitude: 25.7784, longitude: -80.1859 },
];

/** Deterministic ISO day offset from a fixed epoch, so fixtures never drift. */
const FIXTURE_EPOCH = Date.UTC(2026, 8, 1); // 2026-09-01

function fixtureEvent(seed: number, index: number): TmEvent {
  const rand = mulberry32(seed + index * 7919);
  const act = FIXTURE_ACTS[Math.floor(rand() * FIXTURE_ACTS.length)];
  const venue = FIXTURE_VENUES[Math.floor(rand() * FIXTURE_VENUES.length)];
  const dayOffset = Math.floor(rand() * 120);
  const startMs = FIXTURE_EPOCH + dayOffset * 86_400_000 + 20 * 3_600_000;
  const start = new Date(startMs);
  const localDate = start.toISOString().slice(0, 10);
  const onSaleMs = startMs - (30 + Math.floor(rand() * 60)) * 86_400_000;
  const presaleMs = onSaleMs - 7 * 86_400_000;
  const minPrice = 25 + Math.floor(rand() * 12) * 5;
  const id = `FIX${seed.toString(36).toUpperCase()}${index + 1}`;
  return {
    id,
    name: `${act.name} — ${venue.city}`,
    url: `https://example.com/event/${id}`,
    images: [{ url: `https://example.com/img/${id}.jpg`, width: 1024 }],
    dates: {
      start: { localDate, localTime: "20:00:00", dateTime: start.toISOString() },
      timezone: "America/Chicago",
      status: { code: "onsale" },
    },
    sales: {
      public: {
        startDateTime: new Date(onSaleMs).toISOString(),
        endDateTime: new Date(startMs).toISOString(),
      },
      presales: [
        {
          name: "Fan Club Presale",
          startDateTime: new Date(presaleMs).toISOString(),
          endDateTime: new Date(onSaleMs).toISOString(),
        },
      ],
    },
    classifications: [{ segment: { name: act.segment }, genre: { name: act.genre } }],
    priceRanges: [
      { type: "standard", currency: "USD", min: minPrice, max: minPrice + 40 + Math.floor(rand() * 200) },
    ],
    _embedded: {
      venues: [
        {
          name: venue.name,
          city: { name: venue.city },
          state: { name: venue.state },
          country: { name: venue.country },
          address: { line1: venue.address },
          location: { latitude: String(venue.latitude), longitude: String(venue.longitude) },
        },
      ],
    },
  };
}

/**
 * Rebuilds the fixture event a fixture id refers to. Fixture ids encode their
 * own seed and index, so no state is stored; the id must round-trip exactly,
 * which keeps `not_found` reachable in fixture mode.
 */
function fixtureEventById(eventId: string): TmEvent | null {
  const m = /^FIX([0-9A-Z]+)(\d+)$/.exec(eventId);
  if (!m) return null;
  // Try every split point of the trailing digits between seed and index.
  for (let cut = 1; cut <= m[2].length; cut++) {
    const seedPart = m[1] + m[2].slice(0, m[2].length - cut);
    const index = Number(m[2].slice(m[2].length - cut)) - 1;
    const seed = parseInt(seedPart, 36);
    if (!Number.isFinite(seed) || index < 0 || index > 200) continue;
    const candidate = fixtureEvent(seed, index);
    if (candidate.id === eventId) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EventSearchParams {
  keyword: string | null;
  city: string | null;
  countryCode: string | null;
  startDateTime: string | null;
  size: number;
}

/** Search events. Live Ticketmaster Discovery when keyed, fixtures otherwise. */
export async function searchEvents(p: EventSearchParams): Promise<EventSearchResult> {
  const query = { ...p };
  if (hasTicketmasterKey()) {
    const params = new URLSearchParams({ size: String(p.size) });
    if (p.keyword) params.set("keyword", p.keyword);
    if (p.city) params.set("city", p.city);
    if (p.countryCode) params.set("countryCode", p.countryCode);
    if (p.startDateTime) params.set("startDateTime", p.startDateTime);
    const body = (await tmFetch("/events.json", params)) as {
      _embedded?: { events?: TmEvent[] };
    };
    const events = (body._embedded?.events ?? []).map(toEvent);
    return {
      source: "ticketmaster",
      query,
      count: events.length,
      events,
      retrievedAt: new Date().toISOString(),
    };
  }

  const seed = seedFrom(
    p.keyword ?? "",
    p.city ?? "",
    p.countryCode ?? "",
    p.startDateTime ?? "",
  );
  const events = Array.from({ length: p.size }, (_, i) => toEvent(fixtureEvent(seed, i)));
  return {
    source: "fixture",
    query,
    count: events.length,
    events,
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Current on-sale snapshot for one event, plus a delta against the caller's
 * cursor. This is the pay-per-poll shape: every paid call returns a complete,
 * usable snapshot in the body — the delta is a bonus, never the only payload.
 */
export async function onSaleCheck(
  eventId: string,
  callerCursor: string | null,
): Promise<OnSaleCheckResult | null> {
  let raw: TmEvent | null;
  let source: "ticketmaster" | "fixture";

  if (hasTicketmasterKey()) {
    source = "ticketmaster";
    try {
      raw = (await tmFetch(`/events/${encodeURIComponent(eventId)}.json`, new URLSearchParams())) as TmEvent;
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) return null;
      throw err;
    }
  } else {
    source = "fixture";
    raw = fixtureEventById(eventId);
    if (!raw) return null;
  }

  const base = toSnapshot(raw);
  const cursor = cursorFor(base);
  const snapshot: OnSaleSnapshot = {
    ...base,
    cursor,
    observedAt: new Date().toISOString(),
  };

  const changes = callerCursor ? diffCursors(callerCursor, cursor) : [];
  return {
    source,
    snapshot,
    delta: callerCursor
      ? { unchanged: changes.length === 0, changes, since: callerCursor }
      : null,
    retrievedAt: new Date().toISOString(),
  };
}
