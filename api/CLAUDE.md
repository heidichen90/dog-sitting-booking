# CLAUDE.md — api/ (backend)

Folder-specific rules for the Spring Boot API. Shared project rules live in the root `CLAUDE.md` — read that first.

## Stack

- Spring Boot 3.4, Java 21, Maven (`./mvnw` wrapper — don't require a system-wide `mvn`)
- `spring-boot-starter-web`, `spring-boot-starter-actuator`, `springdoc-openapi-starter-webmvc-ui`
- API contract: springdoc-openapi generates the OpenAPI spec from this app; `web/` generates its TS types from that spec.

## Current state

This is a bare scaffold: one health-check endpoint (`/actuator/health`), no database, no JPA, no entities, no domain endpoints yet. Postgres/JPA/Flyway are added in a later step once the dev database exists to connect to — don't add datasource config or entities speculatively.

## Database (once added)

- Dev and prod databases are strictly separate — never point a dev profile at prod, never touch prod data directly.
- Flyway owns the schema. No manual schema changes outside a migration.
