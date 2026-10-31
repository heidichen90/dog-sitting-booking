# CLAUDE.md — api/ (backend)

Folder-specific rules for the Spring Boot API. Shared project rules live in the root `CLAUDE.md` — read that first.

## Stack

- Spring Boot 4.1, Java 21, Maven (`./mvnw` wrapper — don't require a system-wide `mvn`)
- `spring-boot-starter-webmvc`, `spring-boot-starter-actuator`, `springdoc-openapi-starter-webmvc-ui`
- Spring Data JPA (Hibernate), Bean Validation, Flyway, PostgreSQL driver
- API contract: springdoc-openapi generates the OpenAPI spec from this app; `web/` generates its TS types from that spec.

## Current state

Endpoints (all under `/api`): `GET /api/clients`, `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/{id}`, `POST /api/bookings/{id}/cancel` (design in `docs/superpowers/specs/2026-10-30-booking-api-design.md`, prefix in `2026-10-31-web-api-switch-design.md`; schema in `docs/superpowers/specs/2026-10-29-backend-schema-design.md` and `api/docs/schema.md`). `/actuator/health` and `/v3/api-docs` aren't prefixed. `blocked_dates` has no entity yet. No auth and no CORS yet.

## Code conventions

- Packages by feature (`client`, `booking`, `error`). Controller → service → repository.
- Controllers take and return records; entities never leave a service.
- Hibernate runs with `ddl-auto: validate`. It checks entities against Flyway's tables and never changes them.
- `open-in-view` is off: load everything a response needs inside the service transaction, with an `@EntityGraph` for collections.
- Money is `BigDecimal` at scale 2, never `double`.
- Request validation: single-field rules are annotations on the request records; cross-field rules are class-level constraints in `booking/RequestRules.java` that report on the real field (e.g. `stays[0].pickUpDate`). Rules that need the database live in the service.
- Errors are `ProblemDetail`, via `error/ApiExceptionHandler`. Never log or return database error messages: they contain client names and phones. Log the constraint name instead.
- The OpenAPI spec is a contract: `web/` generates its types from it. Operations declare an `operationId` and their error responses (`error/ProblemSchemas`); fixed value lists are `@Schema(allowableValues = …)` on the records. `OpenApiSchemaCustomizer` makes every property required for the response schemas named in its `ALL_PROPERTIES_REQUIRED` list (a new response record must be added there, or its fields come out optional) and has an explicit list only for the Problem schemas; new nullable response fields must be added to its `NULLABLE` map. It also sets `HH:mm` times and `minItems`, because OpenAPI 3.1 output drops `@Schema(nullable = true)`. When a response or request record changes, update that customizer and `OpenApiTest`, then regenerate `web/src/api/schema.d.ts`.

## Database

- Dev and prod databases are strictly separate — never point a dev profile at prod, never touch prod data directly.
- Flyway owns the schema. No manual schema changes outside a migration.
- Local: Postgres.app PG 18. The app connects as role `ddpet_dev` (not a superuser). Credentials live in the repo-root `db.dev.local` (gitignored; never print or commit it), imported by `application.yml`. Run the app and Maven from `api/`, or the import is silently skipped. Dev DB is `dd_pet_care_dev`; test DB is `dd_pet_care_test`.
- Every Spring test must extend `DatabaseTest`. It activates the `test` profile, cleans and re-migrates the test DB once per run (refusing any DB whose name doesn't end in `_test`), and rolls back each test. A test that doesn't extend it would run against the dev DB.
- Migrations are immutable once applied to the dev DB (V1 already is). Changes go in a new `V<n>__…` file.
- Status columns store lowercase values (`confirmed` / `cancelled`). Map JPA enums with an AttributeConverter, not `EnumType.STRING`.
- CI runs tests against a `postgres:18` service container (`.github/workflows/api.yml`).

## Tests

- Test classes are split by behaviour (one class per behaviour, in the feature's package).
- Request bodies live in `src/test/resources/requests/<feature>/<scenario>.json`, loaded with `TestRequests.load(name, Map.of(...))`. Runtime ids are written as `{{placeholders}}`.
- In tests, JPA updates aren't written until flush. Call `flushAndClear()` before reading them back with `jdbc`.
- A test that opts out of the test transaction (e.g. `CreateBookingRollbackTest`) commits real rows, so it must clean up in `@AfterEach`.
