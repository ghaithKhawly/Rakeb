# JR App Context (Single Source of Truth)

Last updated: 2026-03-29
Scope: Product + architecture + routing decisions for backend, graph pipeline, and client/server routing behavior.

## 1) Product Scope
- Region: Damascus, Syria.
- Transit focus: bus network only (about 45 buses/routes expected).
- Source of truth for transit geometry: KMZ.
- Users: single routing behavior model (no user segmentation by role/type for routing logic).
- Routing objective: user-preference-driven (not one fixed global objective).

## 2) Current Architecture (Observed)
- Backend: Fastify + TypeScript + PostgreSQL/PostGIS.
- Graph cache: in-memory snapshot service with invalidate/rebuild flow.
- Routing execution: worker thread (Node worker_threads) via routing worker client.
- Graph build pipeline: Python script rebuilds graph from KMZ and repopulates DB tables.
- Frontend: routing UI scaffold exists, but full end-to-end client-side routing integration is not fully wired yet.

## 3) Canonical Graph Builder
- Preferred builder (current decision): KMZ builder.
- Rebuild policy: mandatory when KMZ changes.

## 4) Routing Strategy (Decided)
- Default mode: client-side routing.
- Fallback mode: server-side routing.
- Fallback trigger: automatic if client-side routing fails.
- Routing logic parity: client and server should use the same logic if implementation cost/performance is acceptable.

## 5) Graph Delivery to Client
- Delivery model: full graph payload (not reduced/minified only).
- Target payload size: around 10 MB.
- Refresh cadence: daily.

## 6) Walking + Transfer Model (Decided)
- Walking edge generation: dynamic during A* expansion.
- Hybrid stance: dynamic is primary; precomputed walking fallback is allowed if dynamic routing fails.
- User preference includes hard walking caps:
  - per-leg cap: `maxWalkingDistanceM`
  - trip-level cumulative cap: `maxTotalWalkingDistanceM`
- Transfer penalty behavior:
  - Bus transfer penalty: first 2 transfers free, then exponential penalty from transfer #3 onward (bus-to-bus route switch only).
  - Walking penalty: exp+linear model from first walking segment.
  - Severity target: mild (soft exponential growth).

## 7) Graph Rebuild/Cache Behavior (Decided)
- Rebuild trigger owner: deployment pipeline.
- During rebuild: serve requests from old graph (no hard outage for routing requests).
- History reuse rule:
  - Reuse old result only while graph is unchanged.
  - Recompute route if graph version changed.
- Graph change detection key: KMZ file hash.

## 8) Directionality + Correctness Priorities
- Direction assumption for now: one-way.
- Not acceptable risk: wrong transfer choices.
- High-priority risks to continuously guard against:
  - route unavailable but still suggested
  - stale graph after KMZ change
  - cost weighting not matching user intent

## 9) History Policy (Current)
- Retention intent: keep history until graph changes, plus auto-expiry.
- Auto-expiry window: 90 days.

## 10) Security Direction
- Sensitive graph/bus mutation endpoints should be admin-protected.
- Current implementation still needs full RBAC hardening.

## 11) Open Decision (Needs Product Confirmation)
- Behavior when no safe/valid route exists:
  - Option A: strict no-route response
  - Option B: return best-effort route with uncertainty label
- Decision pending for partial-route fallback return policy.

## 12) Update Protocol (How This File Will Be Maintained)
This file must be updated whenever a meaningful change happens in:
- routing algorithm/cost model
- graph build/rebuild/invalidation flow
- API contracts affecting routing/graph/history
- data schema affecting routing inputs/outputs
- client/server execution split (offline vs fallback behavior)
- security/access control on graph/routing endpoints

For each future update, append an entry to the changelog below.

---

## Changelog

### 2026-03-29 (Baseline)
- Established single source-of-truth context file.
- Captured confirmed product/routing decisions from stakeholder discussion.
- Marked unresolved behavior for no-route handling as pending.

### 2026-03-29 (Routing V2 Backend Slice 1)
- Implemented worker state-key expansion with bus transfer count and deterministic tie-breaking.
- Implemented exp+linear walking cost and piecewise post-2 transfer exponential cost.
- Added hard cumulative walking cap and max bus transfer cap in worker pruning.
- Added config/schema/type surface for new routing tunables and response fields (`graphVersion`, `bestEffort`).
- Added graph snapshot KMZ-hash versioning and version-aware route history reuse guard.
- Added DB migrations for new preference and history metadata columns.
- Implemented routing fallback chain: dynamic walking → precomputed walking → relaxed best-effort (loosened total walking + transfer cap) when strict attempts fail.
