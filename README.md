# JR — Damascus Transit Router

A public-transit journey planner for **Damascus, Syria**, covering the city's bus
and microbus network (~45 routes). Users describe a trip — by tapping two points
on a map, or by typing it in plain Arabic — and get a ranked set of routes with
walking legs, transfers, and live driver availability.

Built as a TypeScript monorepo: an Expo React Native client, a Fastify +
PostgreSQL/PostGIS backend, and a Python graph-build pipeline that turns KMZ
route geometry into a routable graph.

---

## Why this exists

Damascus has no official transit feed. Route knowledge lives in drivers' heads
and in hand-drawn maps. The source of truth here is a set of **KMZ files** traced
from real routes; everything downstream — the graph, the stops, the walking
network — is derived from them and rebuilt whenever the KMZ changes.

---

## Architecture

```
┌─────────────────────────┐
│  Expo / React Native    │   expo-router · react-query · maps · i18n (ar/en)
│  front/                 │
└───────────┬─────────────┘
            │ REST (JWT)
┌───────────▼─────────────┐
│  Fastify + TypeScript   │   back/
│  ├── routes/handlers    │   auth · bus · trip · navigation · driver · admin
│  ├── nlp/               │   Arabic free-text trip resolution
│  ├── services/          │   graphCache · routingWorkerClient · routingMetrics
│  └── plugins/           │   jwt · postgres
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐     ┌──────────────────────────┐
│  PostgreSQL + PostGIS   │◀────│  Python graph pipeline    │
│  routes · stops · edges │     │  script/build_graph_*.py  │
└─────────────────────────┘     │  ← KMZ route geometry     │
                                └──────────────────────────┘
```

`shared/` and `types/` are a workspace package (`@project/types`) imported by
both client and server, so API contracts stay in sync at compile time.

---

## Routing

Routing runs **A\* over a transit graph** inside a Node `worker_thread`, so a
heavy query never blocks the Fastify event loop.

**Graph cache.** The graph is held in memory as an immutable snapshot, versioned
by the **hash of the source KMZ**. Rebuilds swap the snapshot atomically — during
a rebuild the old graph keeps serving traffic, so there is no routing outage.
Cached route history is reused only while `graphVersion` is unchanged; if the
KMZ changed, the route is recomputed rather than served stale.

**Cost model.** Preference-driven rather than one fixed global objective:

| Component | Behaviour |
|---|---|
| Walking | exponential + linear penalty from the first walking segment |
| Bus transfers | first 2 free, then exponential penalty from transfer #3 |
| Per-leg cap | `maxWalkingDistanceM` — hard prune |
| Trip cap | `maxTotalWalkingDistanceM` — hard cumulative prune |

Walking edges are generated **dynamically during A\* expansion** rather than
precomputed, which keeps the graph small and lets the walking caps act as real
search bounds.

**Fallback chain.** Correctness matters more than always answering, but a dead
end is still worse than a caveated answer:

1. dynamic walking edges (strict caps)
2. precomputed walking fallback
3. relaxed best-effort — loosened walking/transfer caps, response flagged
   `bestEffort: true`

Ties are broken deterministically, so the same query returns the same route.

---

## Arabic natural-language trips

`back/src/nlp/` resolves free-text Arabic into an origin/destination pair —
e.g. *«من المزة إلى باب توما»* — without requiring the user to touch the map.

- **`normalizeArabic.ts`** — strips diacritics, unifies alef/hamza/ya/ta-marbuta
  variants and Arabic-Indic digits, so `المزّة` and `المزه` collapse to one key.
- **`landmarkAliases.ts`** — curated alias table over Damascus landmarks, with
  `validate-aliases.ts` guarding against duplicate or ambiguous entries.
- **`landmarkSearch.ts`** — Fuse.js fuzzy match against an OSM-derived landmark
  set (`curate-osm-landmarks.mjs`) for typo tolerance.
- **`patterns.ts` / `resolveTrip.ts`** — preposition patterns (`من … إلى …`)
  extract the pair; `sessionStore.ts` keeps multi-turn context so a follow-up
  like «وبعدين لجرمانا» resolves against the previous trip.
- An optional LLM pass (Groq) handles phrasings the pattern layer misses.

Covered by `nlp/__tests__/tripResolution.test.ts`.

---

## Features

- **Trip planning** — map-based or Arabic free-text, with a preferences modal
  (max walking, transfer tolerance) that feeds the cost model directly.
- **Route results** — step-by-step legs, route geometry, shareable trip links.
- **Driver mode** — drivers mark themselves active on a route, feeding
  availability into results.
- **Admin dashboard** — create and delete transit routes by drawing them, with
  **OSRM road snapping** to align hand-drawn geometry to real streets; route
  stats; role-guarded behind `requireAdminRole`.
- **Travel history** — 90-day auto-expiry, invalidated on graph version change.
- **Bilingual** — Arabic-first with full RTL, English toggle.
- **Bus + microbus** — both transit types are modelled.

---

## Getting started

Requires Node 20+, PostgreSQL with PostGIS, and Python 3.11+ for the graph
pipeline.

```bash
# backend
cd back
npm install
cp .env.example .env      # fill in DATABASE_URL, JWT/Groq keys
npm run dev               # tsx watch, Swagger UI at /docs

# frontend
cd front
npm install
cp .env.example .env      # EXPO_PUBLIC_API_URL -> your LAN IP, not localhost
npm start                 # expo start --lan
```

Build the routing graph from KMZ:

```bash
python script/build_graph_from_kmz.py          # canonical builder
python script/build_graph_h3_transit_network.py  # H3-indexed variant
python script/benchmark_routing_models.py      # compare builders
```

The KMZ builder is the canonical one. **A rebuild is mandatory whenever the KMZ
changes** — the graph version key is derived from the KMZ hash.

### Tests

```bash
cd back
npm test            # jest, serial
npm run test:nlp    # NLP trip-resolution harness
```

---

## Repository layout

| Path | Contents |
|---|---|
| `back/` | Fastify API, routing worker, NLP, graph cache |
| `front/` | Expo Router app (tabs, settings, maps, admin) |
| `shared/`, `types/` | `@project/types` — shared contracts |
| `script/` | Python graph builders, KMZ export, benchmarks |
| `docs/` | UML, ERD, sequence diagrams (Mermaid + SVG) |
| `APP_CONTEXT.md` | Architecture decision record — **read before changing routing** |

`APP_CONTEXT.md` is the single source of truth for routing and graph decisions
and carries a changelog. Update it whenever the cost model, rebuild flow, API
contracts, or client/server execution split change.

---

## Status

Actively developed. Known open items, tracked in `APP_CONTEXT.md`:

- Full RBAC hardening on graph/bus mutation endpoints.
- No-route policy is undecided — strict empty response vs. best-effort with an
  uncertainty label.
- Routes are currently modelled as **one-way**; bidirectional handling is not
  yet implemented.
