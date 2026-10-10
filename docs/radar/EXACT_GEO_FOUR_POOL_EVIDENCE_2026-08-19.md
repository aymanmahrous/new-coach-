# RADAR exact geo evidence — four approved pools

Status: PRE-PRODUCTION / evidence gate passed for coordinate registry; activation still requires explicit owner approval.

## Approved registry

| Pool | Coordinate used for distance calculations | Evidence basis |
|---|---:|---|
| ICS Al Najda / Al Danah | 24.4870625, 54.3754375 | Owner-approved Google/Waze place is F9PG+R56, Al Najda St, Al Danah. The coordinate is the center of that Open Location Code cell; official ICS confirms City Centre / Al Najda Street. |
| ICS Al Falah | 24.43828, 54.73116 | OpenStreetMap/Mapcarta school building way 1044651641; official ICS confirms New Al Falah City, Sector 1E-P3; owner-approved Google place identity matches the Al Falah campus. |
| ICS Khalifa | 24.411589, 54.605311 | Direct 2GIS International Community School firm listing at SE38, Khalifa City; official ICS confirms SE38, Khalifa City A. Independent nearby 2GIS points place the school 80–150m from coordinates around the same campus, corroborating the exact firm point. |
| ICS Al Mushrif | 24.43450, 54.39804 | OpenStreetMap/Mapcarta school building way 418124897; WorldPlaces independently reports 24.43411, 54.39808; official ICS confirms 24th Street, Al Mushrif Area. |

## Activation rules approved by owner

- `VERY_CLOSE`: <= 500 m
- `NEAR`: > 500 m and <= 2 km
- `LOCAL`: > 2 km and <= 5 km
- `EXTENDED`: > 5 km and <= 8 km
- `OUTSIDE`: > 8 km
- Text-only approved-area matches remain `AREA_ONLY`; no fabricated meter distance.
- Dubai / non-approved areas receive no pool proximity credit.
- Exact distance may be calculated only when the ingestion metadata includes public-source coordinates. Private/customer GPS must not be used.

## Scoring / priority policy

- Clear buyer intent + `VERY_CLOSE` / `NEAR` / `LOCAL`: HOT when score >= 70.
- Clear buyer intent + `EXTENDED`: WARM.
- `AREA_ONLY` with strong intent: HOT under the existing approved-area rule.
- `OUTSIDE` or no approved local match: LOW.
- Synthetic/test rows remain LOW and excluded from operational reporting under the already-live Production hardening.

## Safety

This file does not authorize Production activation. The exact-distance migration must be reviewed on an isolated branch, pass checks, and receive explicit owner Production approval before application.
