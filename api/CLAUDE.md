# CLAUDE.md — api/ (backend)

Folder-specific rules for the Spring Boot API. Shared project rules live in the root `CLAUDE.md` — read that first.

## Stack

- Spring Boot 4.1, Java 21, Maven (`./mvnw` wrapper — don't require a system-wide `mvn`)
- `spring-boot-starter-webmvc`, `spring-boot-starter-actuator`, `springdoc-openapi-starter-webmvc-ui`
- Spring JDBC, Flyway, PostgreSQL driver (no JPA yet)
- API contract: springdoc-openapi generates the OpenAPI spec from this app; `web/` generates its TS types from that spec.

## Current state

The schema exists via `src/main/resources/db/migration/V1__initial_schema.sql` (clients, dogs, bookings, booking_stays, blocked_dates; design in `docs/superpowers/specs/2026-10-29-backend-schema-design.md`). No entities or domain endpoints yet.

## Database

- Dev and prod databases are strictly separate — never point a dev profile at prod, never touch prod data directly.
- Flyway owns the schema. No manual schema changes outside a migration.
- Local: Postgres.app PG 18. The app connects as role `ddpet_dev` (not a superuser). Credentials live in the repo-root `db.dev.local` (gitignored; never print or commit it), imported by `application.yml`. Run the app and Maven from `api/`, or the import is silently skipped. Dev DB is `dd_pet_care_dev`; test DB is `dd_pet_care_test`.
- Every Spring test must extend `DatabaseTest`. It activates the `test` profile, cleans and re-migrates the test DB once per run (refusing any DB whose name doesn't end in `_test`), and rolls back each test. A test that doesn't extend it would run against the dev DB.
- Migrations are immutable once applied to the dev DB (V1 already is). Changes go in a new `V<n>__…` file.
- Status columns store lowercase values (`confirmed` / `cancelled`). Map JPA enums with an AttributeConverter, not `EnumType.STRING`.
- CI runs tests against a `postgres:18` service container (`.github/workflows/api.yml`).
