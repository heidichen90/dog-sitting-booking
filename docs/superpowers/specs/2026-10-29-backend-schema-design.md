# Backend schema design

**Date:** 2026-10-29
**Status:** Approved in brainstorming; awaiting spec review
**Stack:** Spring Boot (Java) + PostgreSQL + Flyway, in `api/` (not yet created)

## Goal

Replace the frontend's localStorage `Booking` records with a relational schema. This resolves the tech debt listed in the root `CLAUDE.md`:

1. Owners and dogs are free text → proper `clients` and `dogs` tables.
2. Rates are per-booking form inputs → the rate actually used is snapshotted on each stay. There is no rates table.
3. No availability modelling → a `blocked_dates` table. Warnings only; capacity is not enforced.
4. Client-side timestamp IDs → database-generated `bigint` identity IDs.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Backend | Spring Boot + Flyway (not Supabase) | Matches the curriculum; later phases need a real backend |
| Client ↔ dog | One client owns many dogs; each dog has one owner | Fits a sole trader |
| Dogs per booking | One dog per booking | Matches the current form |
| Rates | No rates table. Each stay stores the `unit_rate` and `pickup_dropoff_fee` it used | Rates change often and are entered on the form; past prices must not change |
| Multi-day submissions | One booking with many stays | A client books several separate days, pays once for the group, and gets one confirmation |
| Booking total | Calculated: sum of the `price` of confirmed stays | Cancelling one day updates the total with nothing to keep in sync |
| Availability | `blocked_dates` ranges; the API warns on overlap and never refuses | The owner decides capacity |
| Status | `confirmed` / `cancelled` on bookings and stays; no hard deletes | Keeps history; `draft` can be added later for the LLM phase |
| Payments | `paid_at` timestamp on the booking; no payments table | Paid once per group, no partial payments |
| Client details | Name + optional phone | Phone opens the right WhatsApp chat (free `wa.me` link) and supports future message matching |
| Dog details | Name only | YAGNI |
| Dates and times | Separate `date` and nullable `time` columns; a null time means "time TBD" | Replaces `timesTbd`; avoids clock-change and browser-timezone drift for a single-timezone business |
| Service type | Not stored. Derived: 0 nights = Day Care, ≥1 night = Boarding | Can't disagree with the dates |
| IDs | `bigint generated always as identity` | Simple, readable, supported by JPA |

## Tables

All timestamps are `timestamptz`. Every table has `created_at timestamptz not null default now()`. Every table except `blocked_dates` also has `updated_at timestamptz not null default now()`, kept current by JPA `@UpdateTimestamp`.

### `clients`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | bigint identity | no | PK |
| `name` | text | no | Check: not blank (`btrim(name) <> ''`) |
| `phone` | text | yes | Unique when set. The format (e.g. `+447…`) is validated in the API |

### `dogs`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | bigint identity | no | PK |
| `client_id` | bigint | no | FK → `clients(id)` |
| `name` | text | no | Check: not blank |

- Unique `(client_id, name)`: a client can't have two dogs with the same name.
- Unique `(id, client_id)`: the target of the composite FK from `bookings`.

### `bookings`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | bigint identity | no | PK |
| `client_id` | bigint | no | FK → `clients(id)` |
| `dog_id` | bigint | no | |
| `status` | text | no | Default `'confirmed'`. Check: in (`'confirmed'`, `'cancelled'`) |
| `notes` | text | yes | |
| `paid_at` | timestamptz | yes | Null = unpaid |

- Composite FK `(dog_id, client_id)` → `dogs(id, client_id)`: the dog must belong to the booking's client.
- `client_id` is kept even though `dogs.client_id` already records the owner, so the booking keeps who was billed even if the dog later changes owner.

### `booking_stays`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | bigint identity | no | PK |
| `booking_id` | bigint | no | FK → `bookings(id)` |
| `drop_off_date` | date | no | |
| `drop_off_time` | time | yes | Null = TBD |
| `pick_up_date` | date | no | |
| `pick_up_time` | time | yes | Null = TBD |
| `unit_rate` | numeric(8,2) | no | Day rate (Day Care) or overnight rate (Boarding). Check ≥ 0 |
| `pickup_dropoff_fee` | numeric(8,2) | no | Default 0. Check ≥ 0 |
| `price` | numeric(10,2) | no | Check ≥ 0 |
| `status` | text | no | Default `'confirmed'`. Check: in (`'confirmed'`, `'cancelled'`) |

Checks:
- `pick_up_date >= drop_off_date`
- Same-day stay with both times set: `pick_up_time > drop_off_time`
- `price = greatest(pick_up_date - drop_off_date, 1) * unit_rate + pickup_dropoff_fee`. Units are nights, or 1 for Day Care. Discounts are applied by lowering `unit_rate`.

### `blocked_dates`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | bigint identity | no | PK |
| `start_date` | date | no | |
| `end_date` | date | no | Check: `end_date >= start_date` |
| `reason` | text | yes | |

## Business rules (enforced in the API)

- A booking must have at least one stay when it's created.
- Cancelling a booking cancels all its stays. When a booking's last confirmed stay is cancelled, the booking is cancelled too.
- Creating or editing a stay that overlaps a `blocked_dates` range returns a warning, not an error.
- Deletes are never exposed. Every FK is `ON DELETE RESTRICT` (the Postgres default `NO ACTION`).

## Indexes

FK columns only. Primary keys and unique constraints are indexed automatically.

- `dogs(client_id)`: covered by the unique `(client_id, name)` index, so no separate index is needed.
- `bookings(client_id)`
- `bookings(dog_id)`
- `booking_stays(booking_id)`

A `booking_stays(drop_off_date)` index is deliberately left out. At sole-trader volume (thousands of rows) it brings no measurable benefit. Add it in a later migration if a date-filtered query is ever slow.

## Future reporting needs (verified as supported)

Earnings per month, per year and per client need no schema change:

- Sum `booking_stays.price` where both the stay and its booking are `confirmed`.
- **Month/year:** group by `date_trunc('month' | 'year', drop_off_date)`. Income counts on the service date, the whole stay counts in its drop-off month, and unpaid bookings are included.
- **Per client:** join to `bookings` → `clients` and group by client.
- A cash-basis view (grouped by `paid_at`) can be added later as a separate query.

## Migrations and environments

- One migration: `api/src/main/resources/db/migration/V1__initial_schema.sql`. Applied migrations are never edited; later changes go in new `V2__…` files.
- Local databases: Postgres.app (PostgreSQL 18, port 5432), hosting two databases, `dd_pet_care_dev` and `dd_pet_care_test`. No Docker.
- The schema is changed only through Flyway migrations, never by hand in a GUI client such as TablePlus.
- Prod database: hosting not yet decided (separate decision). It must run PostgreSQL 18 to match local.
- Spring profiles `dev` and `prod`. Database credentials come only from environment variables and are never committed.
- Flyway `clean` stays disabled.

## Testing

Integration tests run against real Postgres: locally the `dd_pet_care_test` database, and in GitHub Actions a Postgres 18 service container. Each test rolls back its transaction. Testcontainers is not used.

1. V1 applies cleanly to an empty database.
2. Each check, unique and FK constraint above rejects an invalid row.
3. The reporting queries give the correct totals for a stay that crosses a month boundary and exclude a cancelled stay and a cancelled booking.

## Deferred: auth and guessable IDs

Sequential IDs are predictable (client #5 implies #4 and #6 exist). This is acceptable for now because:

- **Auth is the real protection, and it's required before going public.** The API must not be deployed anywhere reachable from the internet until it requires login. Without auth, every endpoint is exposed whatever the ID format.
- **Client-facing links will use a random token.** If clients ever receive a link (e.g. in the WhatsApp phase), it must use a random token such as a `public_id uuid` column added in a later migration, never the numeric ID.

## Out of scope

Auth, API endpoints/OpenAPI, prod hosting, a payments table, capacity limits, draft status, dog breed/notes, client address, and frontend changes (the frontend `Booking` type will be replaced by generated types once the API exists).
