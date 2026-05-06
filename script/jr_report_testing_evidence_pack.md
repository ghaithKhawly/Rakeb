# JR Project Testing and Results Evidence Pack

Use this file as source material for writing the report sections **6.2 Testing** and **6.3 Results**. It is intentionally data-heavy and focuses on actual algorithm behavior, thresholds, formulas, and observed validation outcomes.

## 1. Scope of Validation

The JR project was validated across its main executable components:

- Backend routing service in `back/src/workers/routingWorker.ts`
- Graph construction script in `script/build_graph_from_kmz.py`
- Frontend Expo application in `front`

The repository does not contain a dedicated unit-test suite, so evaluation was performed using:

- TypeScript backend build validation
- Frontend lint validation
- Python syntax compilation for the graph builder
- Algorithm-level analysis of routing and graph-building logic

## 2. Observed Validation Outcomes

### 2.1 Executable checks

| Check | Command | Outcome |
|---|---|---|
| Backend build | `npm run build` in `D:/JR/back` | Passed |
| Frontend lint | `npm run lint` in `D:/JR/front` | Passed with 1 warning |
| Python syntax | `python -m py_compile build_graph_from_kmz.py` in `D:/JR/script` | Passed |

### 2.2 Frontend lint detail

The frontend lint run completed successfully after one JSX parsing issue was corrected during the sweep. The final lint output still contained one non-blocking React hook warning:

- `useEffect` missing dependency: `t` in `front/app/(tabs)/index.tsx`

This warning does not stop execution, but it is useful to mention in the report as a minor code-quality issue.

## 3. Key Algorithm Parameters

### 3.1 Routing engine constants

Source: `back/src/constants/routingConstants.ts`

| Parameter | Value | Meaning |
|---|---:|---|
| `WALK_DISTANCE_REF_M` | 400 | Reference distance for walking cost normalization |
| `WALK_LINEAR_COEFF` | 1.0 | Linear walking-cost weight |
| `WALK_EXP_COEFF` | 0.1 | Exponential walking-cost weight |
| `WALK_EXP_SCALE_M` | 800 | Exponential walking scale |
| `TRANSFER_REF` | 1.0 | Base transfer reference |
| `TRANSFER_EXP_COEFF` | 0.5 | Transfer penalty coefficient |
| `TRANSFER_EXP_RATE` | 0.8 | Transfer penalty growth rate |
| `AVAILABILITY_COST_COEFF` | 0.75 | Availability penalty coefficient |
| `DEFAULT_MAX_BUS_TRANSFERS` | 5 | Default bus-transfer cap |

### 3.2 Graph-builder constants

Source: `script/build_graph_from_kmz.py`

| Parameter | Value | Meaning |
|---|---:|---|
| `AVG_BUS_SPEED_KMH` | 25.0 | Speed used to estimate travel time on bus edges |
| `TRANSFER_DIST_THRESHOLD` | 200 m | Distance threshold for transfer-node creation |
| `NODE_MERGE_TOLERANCE` | 10 m | Cluster tolerance for merging nearby nodes |
| `DEFAULT_ACCESS_GAP_M` | 400 m | Densification gap used to add access nodes |
| Route geometry simplification tolerance | about 0.0005 degrees | Approx. 55 m simplification before graph building |

### 3.3 Routing worker search settings

Source: `back/src/workers/routingWorker.ts`

| Parameter | Value | Meaning |
|---|---:|---|
| `maxExpandedStates` | 80,000 by default | Hard budget for the search frontier |
| `maxWalkingNeighbors` | 12 | Maximum nearby walking candidates per node |
| `maxBusTransfers` | 5 | Default transfer cap if no user override exists |
| Long-walk state bucket | 100 m | Internal discretization for route-state tracking |

## 4. Routing Algorithm: Functionality and Logic

The routing engine uses a **weighted A\*** search. It does not optimize only distance. Instead, it combines five weighted components:

- speed
- crowding
- price
- transfers
- walking

It also includes a separate availability term.

### 4.1 Cost equation

The worker computes route cost as:

`total cost = speed + crowding + price + transfer + walking + availability`

with the availability part weighted by:

`availability cost = 0.75 × (1 - availabilityRatio)`

### 4.2 Walking cost formula

Walking cost is computed from both a linear and an exponential term:

`walking cost = (distance / 400) + 0.1 × (exp(distance / 800) - 1)`

The speed component for walking is:

`speed component = (distance / walkingSpeed) / 600`

where `walkingSpeed = 1.25 m/s` in the default config.

### 4.3 Transfer cost formula

The transfer term grows exponentially:

`transfer cost = 0.5 × (exp(0.8 × (transfers_after - 2)) - 1)`

Important interpretation:

- At `transfers_after = 2`, the transfer term is `0.0`
- At `transfers_after = 3`, it becomes positive
- Higher transfers grow quickly, so the algorithm strongly discourages transfer-heavy routes

### 4.4 Availability handling

Availability is treated as a route-quality signal:

- `availabilityRatio = 1.0` means no penalty
- `availabilityRatio = 0.0` means maximum penalty in the cost model

In strict production mode, bus edges with zero availability are skipped entirely, so they are not route options.

In development mode, the system can fail open when there are no active drivers globally, which keeps the router usable for testing.

## 5. Quantitative Routing Examples

All values below were computed directly from the implemented formulas.

### 5.1 Walking cost examples

Assumptions:

- walking speed = `1.25 m/s`
- walking reference = `400 m`
- walking exponential scale = `800 m`

| Walking distance | Speed component | Walking component | Total walking cost |
|---:|---:|---:|---:|
| 100 m | 0.133333 | 0.263315 | 0.396648 |
| 400 m | 0.533333 | 1.064872 | 1.598205 |
| 800 m | 1.066667 | 2.171828 | 3.238495 |
| 1200 m | 1.600000 | 3.348169 | 4.948169 |
| 1600 m | 2.133333 | 4.638906 | 6.772239 |

### 5.2 Transfer penalty examples

| Transfers after boarding | Transfer cost |
|---:|---:|
| 2 | 0.000000 |
| 3 | 0.612770 |
| 4 | 1.976516 |
| 5 | 5.011588 |

These values show a steep penalty curve, which pushes the router toward fewer-transfer paths when alternatives exist.

### 5.3 Availability penalty examples

| Availability ratio | Availability cost |
|---:|---:|
| 1.00 | 0.000000 |
| 0.75 | 0.187500 |
| 0.50 | 0.375000 |
| 0.25 | 0.562500 |
| 0.00 | 0.750000 |

## 6. Graph-Building Algorithm: Functionality and Logic

The KMZ graph builder converts route geometry into a transit graph that can be used by the routing engine.

### 6.1 Main steps

1. Parse KMZ files and extract KML bus routes.
2. Simplify each route geometry for graph construction.
3. Insert routes into PostgreSQL/PostGIS.
4. Generate candidate nodes from:
   - route endpoints
   - route intersections
   - near-parallel route midpoints within 200 m
   - densified access points on long gaps
5. Cluster candidate nodes using DBSCAN with a 10 m tolerance.
6. Insert final nodes into the database.
7. Associate nodes with routes using projected fractional position along each route.
8. Insert ordered route-node relations.
9. Generate directed edges between consecutive route nodes.

### 6.2 Quantitative graph rules

| Rule | Value | Result |
|---|---:|---|
| Transfer node creation threshold | 200 m | Routes within this distance can create a midpoint transfer node |
| Node merge tolerance | 10 m | Candidate nodes closer than this are merged |
| Route speed | 25 km/h | Used to estimate travel time for each edge |
| Densification gap | 400 m | Long route segments are split with extra access nodes |

### 6.3 Directed-edge count rule

If a route has `n` ordered nodes, the builder creates:

`2 × (n - 1)` directed edges

Examples:

| Ordered nodes on a route | Directed edges created |
|---:|---:|
| 2 | 2 |
| 3 | 4 |
| 4 | 6 |
| 5 | 8 |
| 6 | 10 |

### 6.4 Densification examples

The route densification rule can be expressed as:

`new access nodes ≈ ceil(L / 400) - 1`

for a route of length `L` when there are no pre-existing interior nodes.

| Route length | New access nodes |
|---:|---:|
| 400 m | 0 |
| 800 m | 1 |
| 1200 m | 2 |
| 1600 m | 3 |
| 2000 m | 4 |
| 2800 m | 6 |

This makes the graph denser on long routes, improving first-mile/last-mile boarding opportunities.

## 7. Complexity and Scaling Notes

### 7.1 Routing search

The routing worker uses a bounded weighted A\* search with:

- a hard state expansion budget of 80,000
- up to 12 walking neighbors per node in dynamic walking mode
- transfer caps to prevent excessive state explosion

This makes the search more controlled than an unbounded exhaustive graph traversal.

### 7.2 Graph construction

The graph builder has a pairwise route-comparison step, so route-pair checks scale as:

`O(R^2)`

where `R` is the number of routes.

After node ordering, directed edge generation is linear in the number of ordered nodes for each route.

The clustering stage uses DBSCAN with a ball-tree / haversine metric, which is appropriate for geospatial node merging.

## 8. Comparisons You Can Mention in the Report

### 8.1 Dynamic vs precomputed walking

- Dynamic walking: generates nearby walk candidates on the fly.
- Precomputed walking: reuses stored walk edges.
- Dynamic mode is more flexible; precomputed mode is easier to reuse and can be more deterministic.

### 8.2 Strict vs fail-open availability

- Strict mode: zero-availability routes are not eligible.
- Fail-open mode: when there are no active drivers globally, the router can still operate in development.
- This avoids blocking the system during early-stage testing while still enforcing realism in production.

### 8.3 Graph densification vs raw geometry only

- Raw geometry alone may leave long route segments with few boarding points.
- Densification inserts extra access nodes every 400 m of uncovered gap.
- This improves graph connectivity and route usability.

## 9. Suggested Report Language From These Results

If you need to write a formal academic paragraph, the strongest evidence is:

- the project passed backend build, frontend lint, and Python syntax validation
- the routing algorithm is a weighted A\* model with quantified costs
- the graph builder is a geospatial network-construction pipeline with measurable thresholds
- availability and transfer penalties are not arbitrary; they are explicitly parameterized and numerically testable

## 10. Copy-Paste Summary for Another Chat

The JR project was evaluated using code-level validation and formula-based algorithmic analysis. The backend build passed, frontend lint passed with one non-blocking warning, and the KMZ graph-builder script passed Python syntax compilation. The routing engine uses weighted A\* search with speed, crowding, price, transfer, walking, and availability costs. Important constants are 400 m walk reference, 800 m walk exponential scale, 200 m transfer threshold, 10 m merge tolerance, 400 m densification gap, 25 km/h bus speed, and 80,000 maximum expanded states. Concrete computed examples include walking costs of 0.396648 at 100 m, 1.598205 at 400 m, 3.238495 at 800 m, 4.948169 at 1200 m, transfer penalties of 0.0 at 2 transfers, 0.612770 at 3 transfers, 1.976516 at 4 transfers, and availability penalties of 0.0 at ratio 1.0 and 0.75 at ratio 0.0. The graph builder uses route endpoints, intersections, midpoint transfer nodes, DBSCAN clustering, and access-node densification, with edge creation following `2 × (n - 1)` directed edges per ordered route-node chain.
