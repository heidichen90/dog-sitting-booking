# CLAUDE.md — api/ (backend)

Folder-specific rules for the Spring Boot API. Shared project rules live in the root `CLAUDE.md` — read that first.

## Stack

- Spring Boot 4.1, Java 21, Maven (`./mvnw` wrapper — don't require a system-wide `mvn`)
- `spring-boot-starter-webmvc`, `spring-boot-starter-actuator`, `springdoc-openapi-starter-webmvc-ui`
- Spring Security 7 (owner login) and Spring Session JDBC (`spring-boot-starter-security`, `spring-boot-starter-session-jdbc`; tests use `spring-boot-starter-security-test`)
- Spring Data JPA (Hibernate), Bean Validation, Flyway, PostgreSQL driver
- API contract: springdoc-openapi generates the OpenAPI spec from this app; `web/` generates its TS types from that spec.

## Current state

Endpoints (all under `/api`): `GET /api/clients`, `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/{id}`, `POST /api/bookings/{id}/cancel` (design in `docs/superpowers/specs/2026-10-30-booking-api-design.md`, prefix in `2026-10-31-web-api-switch-design.md`; schema in `docs/superpowers/specs/2026-10-29-backend-schema-design.md` and `api/docs/schema.md`). `/actuator/health` and `/v3/api-docs` aren't prefixed. `blocked_dates` has no entity yet.

**Login:**
- There is one owner account, from `OWNER_USERNAME` / `OWNER_PASSWORD_HASH` (`{noop}` in dev, `{bcrypt}` required with the `prod` profile).
- `POST /api/login` (JSON, 204/400/401/429), `POST /api/logout` (204) and `GET /api/me`. Everything else under `/api` needs the `SESSION` cookie; without it you get a 401 ProblemDetail.
- Sessions live in `spring_session` (Flyway V2). A login lasts 30 days from the moment of login: the cookie has `Max-Age` 30 days, and the server session times out after 30 days idle.
- A `DefaultCookieSerializerCustomizer` in `SecurityConfig` re-applies the `server.servlet.session.cookie.*` properties, because MockMvc tests count as a WAR deployment and Boot skips them. It is null-safe.
- CSRF: non-GET requests send the `XSRF-TOKEN` cookie value as `X-XSRF-TOKEN` (403 otherwise); login is exempt. The `XSRF-TOKEN` cookie is `Secure` in prod through a cookie customizer.
- 5 failed logins in 15 minutes give a 429 for 15 minutes (in memory). 400 validation failures don't count.
- Code is in `auth/`. Filter-chain errors are resolved by `ApiExceptionHandler`.

**No CORS:** the website reaches the API through the Vite proxy (dev) or a Vercel rewrite (prod), so it's always same-origin.

**Production:**
- The `prod` profile (`application-prod.yml`) turns off `/v3/api-docs` and Swagger UI, marks the cookie `Secure`, and trusts forwarded headers.
- Cloud Run `ddpet-api` (europe-west2, 0-1 instances), deployed by `.github/workflows/api-deploy.yml` from `api/Dockerfile`.
- Neon PG 18 database `dd_pet_care_prod`; secrets come from Secret Manager.
- Runbooks are in `docs/runbooks/`.

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
- Local: Postgres.app PG 18. The app connects as role `ddpet_dev` (not a superuser). Credentials live in the repo-root `db.dev.local` (gitignored; never print or commit it), imported by `application.yml`. It also holds `OWNER_USERNAME` / `OWNER_PASSWORD_HASH` (see `docs/runbooks/local-login.md`). Run the app and Maven from `api/`, or the import is silently skipped. Dev DB is `dd_pet_care_dev`; test DB is `dd_pet_care_test`.
- Every Spring test must extend `DatabaseTest`. It activates the `test` profile, cleans and re-migrates the test DB once per run (refusing any DB whose name doesn't end in `_test`), and rolls back each test. A test that doesn't extend it would run against the dev DB.
- Migrations are immutable once applied to the dev DB (V1 already is). Changes go in a new `V<n>__…` file.
- Status columns store lowercase values (`confirmed` / `cancelled`). Map JPA enums with an AttributeConverter, not `EnumType.STRING`.
- After a Spring Security or Spring Session upgrade, stored sessions may no longer deserialise: run `DELETE FROM spring_session;` (dev, and in prod via the owner) to log everyone out.
- CI runs tests against a `postgres:18` service container (`.github/workflows/api.yml`).

## Tests

- Test classes are split by behaviour (one class per behaviour, in the feature's package).
- Request bodies live in `src/test/resources/requests/<feature>/<scenario>.json`, loaded with `TestRequests.load(name, Map.of(...))`. Runtime ids are written as `{{placeholders}}`.
- In tests, JPA updates aren't written until flush. Call `flushAndClear()` before reading them back with `jdbc`.
- A test that opts out of the test transaction (e.g. `CreateBookingRollbackTest`) commits real rows, so it must clean up in `@AfterEach`.
- `DatabaseTest`'s `getJson`/`postJson`/`postEmpty`/`perform` send requests as the logged-in owner with a CSRF token. The raw `mvc` field is anonymous: use it for security tests, and `login(username, password)` for a real login.
- CSRF in tests uses a real `XSRF-TOKEN` cookie plus the `X-XSRF-TOKEN` header, never spring-security-test's `csrf()`.
- Spring Session writes in its own transaction. A test that really logs in commits `spring_session` rows, so it uses `@Transactional(propagation = NOT_SUPPORTED)` and deletes them in `@AfterEach`. Tests that fail logins on purpose call `LoginThrottle.recordSuccess()` in `@AfterEach`.
