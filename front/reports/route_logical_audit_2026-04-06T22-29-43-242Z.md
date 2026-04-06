# Logical Route Quality Audit

Generated: 2026-04-06T22:29:43.240Z
Endpoint: http://localhost:3004/api/busses/navigation/quick-route
Cases: 60

## Summary

- Successful routes: 60
- Routes with issues: 48
- Routes with high-severity issue: 34
- Avg issues per successful route: 1.17

### Issue Type Counts
- transfer_near_destination: 2
- long_walk_where_bus_lines_exist_nearby: 30
- high_detour_ratio: 11
- bus_backtracking_away_from_destination: 8
- possible_needless_transfer: 6
- very_short_post_transfer_bus_segment: 12
- many_transfers: 1

## Top Problematic Routes

| Case | Bucket | ETA min | Transfers | Walk m | Detour x | Severity Score | Issues |
|---|---|---:|---:|---:|---:|---:|---|
| long-15 | long | 66.7 | 2 | 1661 | 1.87 | 12 | high_detour_ratio, many_transfers, long_walk_where_bus_lines_exist_nearby, bus_backtracking_away_from_destination, possible_needless_transfer |
| short-4 | short | 25.0 | 1 | 567 | 2.40 | 10 | high_detour_ratio, long_walk_where_bus_lines_exist_nearby, bus_backtracking_away_from_destination, possible_needless_transfer |
| long-11 | long | 51.6 | 0 | 1465 | 1.33 | 8 | very_short_post_transfer_bus_segment, long_walk_where_bus_lines_exist_nearby, long_walk_where_bus_lines_exist_nearby |
| long-12 | long | 61.4 | 0 | 1245 | 1.30 | 8 | very_short_post_transfer_bus_segment, long_walk_where_bus_lines_exist_nearby, long_walk_where_bus_lines_exist_nearby |
| medium-14 | medium | 55.3 | 1 | 586 | 2.53 | 7 | high_detour_ratio, bus_backtracking_away_from_destination, possible_needless_transfer |
| medium-17 | medium | 32.7 | 0 | 984 | 1.90 | 7 | high_detour_ratio, long_walk_where_bus_lines_exist_nearby, bus_backtracking_away_from_destination |
| short-7 | short | 13.7 | 0 | 445 | 2.04 | 5 | high_detour_ratio, transfer_near_destination |
| short-16 | short | 28.5 | 0 | 1039 | 2.19 | 5 | high_detour_ratio, long_walk_where_bus_lines_exist_nearby |
| medium-7 | medium | 30.1 | 0 | 993 | 1.52 | 5 | very_short_post_transfer_bus_segment, long_walk_where_bus_lines_exist_nearby |
| long-1 | long | 64.2 | 0 | 1336 | 1.63 | 5 | long_walk_where_bus_lines_exist_nearby, bus_backtracking_away_from_destination |
| short-13 | short | 26.5 | 0 | 588 | 2.54 | 4 | high_detour_ratio, bus_backtracking_away_from_destination |
| medium-16 | medium | 36.2 | 0 | 564 | 2.53 | 4 | high_detour_ratio, bus_backtracking_away_from_destination |
| long-16 | long | 49.6 | 0 | 510 | 1.54 | 4 | very_short_post_transfer_bus_segment, bus_backtracking_away_from_destination |
| short-2 | short | 12.7 | 0 | 346 | 1.24 | 3 | transfer_near_destination |
| short-3 | short | 17.8 | 0 | 693 | 1.46 | 3 | long_walk_where_bus_lines_exist_nearby |
| short-9 | short | 15.8 | 0 | 946 | 1.01 | 3 | long_walk_where_bus_lines_exist_nearby |
| short-12 | short | 20.3 | 0 | 1011 | 1.31 | 3 | long_walk_where_bus_lines_exist_nearby |
| short-14 | short | 13.9 | 0 | 694 | 1.25 | 3 | long_walk_where_bus_lines_exist_nearby |
| short-15 | short | 27.8 | 0 | 1344 | 1.54 | 3 | long_walk_where_bus_lines_exist_nearby |
| medium-1 | medium | 22.5 | 0 | 712 | 1.55 | 3 | long_walk_where_bus_lines_exist_nearby |
| medium-3 | medium | 45.5 | 0 | 1372 | 1.55 | 3 | long_walk_where_bus_lines_exist_nearby |
| medium-4 | medium | 30.3 | 0 | 892 | 1.47 | 3 | long_walk_where_bus_lines_exist_nearby |
| medium-5 | medium | 36.2 | 1 | 781 | 1.42 | 3 | possible_needless_transfer |
| medium-8 | medium | 19.5 | 0 | 485 | 1.40 | 3 | long_walk_where_bus_lines_exist_nearby |
| medium-9 | medium | 33.6 | 0 | 1088 | 1.35 | 3 | long_walk_where_bus_lines_exist_nearby |
