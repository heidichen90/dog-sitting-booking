# Booking API Design

**Status:** approved 2026-10-30
**Builds on:** `2026-10-29-backend-schema-design.md` (V1 schema, merged in PR #1)

## Goal

Give `api/` the endpoints the frontend needs for what it does today with `localStorage`: create a booking with its stays, list bookings, and cancel a booking. Switching `web/` over to the API is the next plan.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Scope | Backend only, covering today's three flows | Frontend switch-over is a separate plan |
| Data access | JPA / Hibernate | Cascade-saves a booking with its stays; `@UpdateTimestamp` keeps `updated_at` current |
| Client and dog in a create request | Each is either `{id}` (existing) or new details (`{name, phone}` / `{name}`) | No guessing by name; new clients and dogs are created in the same transaction as their first booking |
| Existing match for a "new" dog | Reuse the client's dog with the same name (case- and space-insensitive) | Dog names are unique per client, so the match is unambiguous |
| Existing match for a "new" client's phone | Reject with 409 naming the existing client | The typed name may differ; the sitter confirms it's the same person |
| Pricing inputs | Each stay sends `unitRate` and `pickupDropoffFee`; the server computes `price` | Keeps the frontend's choice of day vs night rate; no fee constant on the server |
| Cancel | Whole booking only | Matches today's delete button; per-stay cancel is added when a screen needs it |
| Code structure | Controller → service → repository, with request/response records; packages by feature | Entities never reach JSON, so the API contract stays stable and lazy loading can't leak |

## API contract

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/clients` | All clients with their dogs, sorted by name (feeds a picker) |
| `POST` | `/bookings` | Create a booking with its stays. `201 Created`, `Location: /bookings/{id}`, body is the booking |
| `GET` | `/bookings` | All bookings, newest first, cancelled included |
| `GET` | `/bookings/{id}` | One booking |
| `POST` | `/bookings/{id}/cancel` | Set the booking and all its stays to `cancelled` (so `total` becomes 0.00); returns it. Cancelling a cancelled booking returns it unchanged |

### Create request

```json
{
  "client": { "id": 3 },
  "dog":    { "name": "Biscuit" },
  "notes": "Allergic to chicken",
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": "09:00",
      "pickUpDate": "2026-11-04",  "pickUpTime": null,
      "unitRate": 40.00, "pickupDropoffFee": 15.00 }
  ]
}
```

- `client` is `{ "id": … }` or `{ "name": …, "phone": … }` (phone optional, E.164).
- `dog` is `{ "id": … }` or `{ "name": … }`. A new client must come with a new dog.
- `notes` is optional. A `null` time means "time TBD".

### Booking response

```json
{
  "id": 12, "status": "confirmed", "notes": "Allergic to chicken",
  "paidAt": null, "createdAt": "2026-10-30T09:12:00Z",
  "client": { "id": 3, "name": "Sarah Lee", "phone": "+447700900123" },
  "dog":    { "id": 7, "name": "Biscuit" },
  "total": 95.00,
  "stays": [
    { "id": 31, "service": "boarding",
      "dropOffDate": "2026-11-02", "dropOffTime": "09:00",
      "pickUpDate": "2026-11-04",  "pickUpTime": null,
      "unitRate": 40.00, "pickupDropoffFee": 15.00, "price": 95.00, "status": "confirmed" }
  ]
}
```

- `total` is the sum of `price` over confirmed stays, computed on read.
- `service` is derived: `day_care` when drop-off and pick-up are on the same date, otherwise `boarding`.

### `GET /clients` response

```json
[ { "id": 3, "name": "Sarah Lee", "phone": "+447700900123",
    "dogs": [ { "id": 7, "name": "Biscuit" } ] } ]
```

### Errors

All errors are `ProblemDetail` JSON. Validation errors list each field:

```json
{ "status": 400, "title": "Invalid request",
  "errors": [ { "field": "stays[0].pickUpDate", "message": "must not be before dropOffDate" } ] }
```

| Status | When |
|---|---|
| 400 | Missing or blank fields; no stays; both or neither of `id` and `name` on client or dog; phone not E.164; pick-up date before drop-off; same-day pick-up time not after drop-off time; negative rate or fee; more than 2 decimal places; over a limit (below); times not `HH:mm`; dog `id` belongs to another client; new client with an existing dog `id`; malformed JSON or wrongly typed values |
| 404 | Unknown client, dog or booking id |
| 409 | New client's phone already on file. Body includes `"existingClient": { "id": 3, "name": "Sarah Lee" }` |
| 500 | Any other database constraint violation (means our validation missed a case). Only the constraint name is logged, never the row, since Postgres's message includes names and phones |
| 500 | Any other unexpected exception: title "Internal error", generic detail, logged with stack trace |

**Request limits** (approved 2026-10-30), each a 400 naming the field:

| Limit | Value |
|---|---|
| Stays per booking | 1 to 31 |
| Nights per stay | at most 60 (`stays[i].pickUpDate`) |
| Drop-off year | 2000 to 2100 (`stays[i].dropOffDate`); a sanity bound so out-of-range dates can't reach Postgres |
| `unitRate`, `pickupDropoffFee` | 0 to 9999.99, 2 decimal places |
| Client name, dog name | at most 100 characters; blank (incl. Unicode spaces) rejected |
| `notes` | at most 2000 characters |
| Times | `HH:mm` only |

**Error fields name the input to highlight:**
- Blank names report `client.name` / `dog.name`.
- `id`/`name` combination errors report `client` / `dog`.
- Stay date rules report `stays[i].pickUpDate`, and the same-day time rule reports `stays[i].pickUpTime`.

A malformed or mistyped body returns the same "Invalid request" title, with a generic detail and no parser internals.

## Persistence

### Dependencies (approved)

- `spring-boot-starter-data-jpa`
- `spring-boot-starter-validation`

### Hibernate settings

- `spring.jpa.hibernate.ddl-auto: validate`: Hibernate checks entities against the Flyway schema at startup and never changes it.
- `spring.jpa.open-in-view: false`: all database access happens inside the service.

### Entities

`blocked_dates` gets no entity in this plan; nothing uses it yet.

| Entity | Maps | Relations |
|---|---|---|
| `Client` | `clients` | has many `Dog` (used by `GET /clients`) |
| `Dog` | `dogs` | belongs to `Client` |
| `Booking` | `bookings` | belongs to `Client` and `Dog`; owns its `BookingStay` list (saved with the booking) |
| `BookingStay` | `booking_stays` | belongs to `Booking` |

- IDs: `@GeneratedValue(strategy = IDENTITY)`, matching the `GENERATED ALWAYS AS IDENTITY` columns.
- Status: a `Status` enum (`CONFIRMED`, `CANCELLED`) stored as lowercase text through an `AttributeConverter`.
- Money: `BigDecimal` everywhere, never `double`. `double` cannot represent most decimal amounts exactly (3 × 33.30 = 99.89999999999999), and the database checks `price` exactly.
- Price: `BookingStay` computes `max(nights, 1) × unitRate + pickupDropoffFee`, scale 2, when it is created. The V1 check constraint remains as a backstop.
- Timestamps: `Instant` fields with `@CreationTimestamp` and `@UpdateTimestamp`. Rows changed by SQL outside JPA don't bump `updated_at`; nothing does that today.

### Create flow (`BookingService.create`, one transaction)

1. Resolve the client: by `id` (404 if missing), or check the phone is free (409 if not) and create a new client.
2. Resolve the dog: by `id` (404 if missing, 400 if it belongs to another client), or reuse the client's dog with the same name, or create a new dog.
3. Build the booking and its stays, save, and return the response.

If any step fails, nothing is saved. A concurrent create with the same new phone trips the `clients_phone_key` unique constraint, which maps to the same 409.

### Reads

`GET /bookings` and `GET /bookings/{id}` load bookings with their client, dog and stays in a fixed number of queries regardless of how many bookings exist (no N+1).

## Validation placement

- **Single-field rules** are Bean Validation annotations on the request records.
- **Cross-field rules** that need no database (id XOR name, date order, same-day time order) are class-level constraints in `booking/RequestRules.java` (`@ValidClientRef`, `@ValidDogRef`, `@ValidStayDates`). Their validators report on the real field (`client`, `dog`, `stays[i].pickUpDate`, `stays[i].pickUpTime`, `stays[i].dropOffDate`), not on a synthetic method name.
- **Rules that need the database** (unknown id, dog/client mismatch, phone in use) are in `BookingService`.
- Names are trimmed before saving.
- One `@RestControllerAdvice` maps every error to `ProblemDetail`.

## Testing

All Spring tests extend `DatabaseTest` (test profile, `dd_pet_care_test`, rollback per test).

### File layout

One test class per behaviour, in the package of the feature it covers:

```
api/src/test/java/com/ddpetcare/api/
  booking/
    StayPriceTest.java                 pricing unit tests, no Spring
    CreateBookingTest.java             happy paths
    CreateBookingValidationTest.java   400 cases
    ClientAndDogResolutionTest.java    existing/new client and dog, dog reuse, 404s, 409
    CreateBookingRollbackTest.java     a failed create leaves no rows behind
    ListBookingsTest.java              GET /bookings and /bookings/{id}, total, ordering
    CancelBookingTest.java             cancel (cascades to stays), cancel twice, updated_at changes
    BookingQueryCountTest.java         same query count for 1 and 5 bookings
  client/
    ListClientsTest.java
  error/
    ApiExceptionHandlerTest.java       constraint-violation mapping, catch-all 500
    SpringErrorsStillMappedTest.java   Spring's own 400/405 still handled
  OpenApiTest.java                     /v3/api-docs lists the five endpoints
```

Request bodies live in their own JSON files, one per scenario, named after it:

```
api/src/test/resources/requests/bookings/
  create-existing-client-new-dog.json
  create-new-client-new-dog.json
  create-reuse-dog-different-case.json
  create-phone-in-use.json
  create-pickup-before-dropoff.json
  create-at-limits.json
  ...
```

Ids that tests create at run time are written as placeholders (`{{clientId}}`, `{{dogId}}`) and filled in by a small test helper when the file is loaded.

### Coverage

- Pricing: day care, multi-night boarding, the fee, and 3 × £33.30 = £99.90 exactly.
- Every 400, 404 and 409 case in the contract, plus a happy path for each endpoint.
- New client and new dog created in one request; dog reuse with different case.
- `total` excludes cancelled stays (set up by SQL, since per-stay cancel has no endpoint).
- `updated_at` changes on cancel.
- A failed create leaves no client, dog or booking rows behind.
- Listing 1 or 5 bookings issues the same number of SQL queries (Hibernate statistics).
- Entity/schema mismatches fail the build via `ddl-auto: validate`.

## Future to-dos

- **OpenAPI precision before generating TypeScript types** (first step of the frontend plan): mark response fields required/nullable, give `status` and `service` enum values, document `POST /bookings` as 201 with `Location`, document the 400/404/409 ProblemDetail shapes, and set readable operationIds.

- **Auth vs the catch-all 500 handler.** When Spring Security is added, make sure `AccessDeniedException` and `AuthenticationException` aren't turned into 500s by the catch-all `@ExceptionHandler(Exception.class)`. Rethrow them or give them their own handlers, so they stay 403/401.

- **Race-case 409 has no `existingClient`.** If two creates with the same new phone race past the service's check, the `clients_phone_key` constraint fires after the Hibernate session is already broken, so the 409 can't look up and name the existing client. Accepted for now (one user, no concurrent creates); revisit if the API ever has concurrent writers, e.g. by retrying the lookup in a new transaction.

## Out of scope

Paging and filters; editing bookings; marking paid; blocked-date or capacity checks; per-stay cancel; auth; CORS and frontend changes (next plan).
