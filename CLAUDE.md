# CLAUDE.md — DD Pet Care Booking

## Project context

A dog-sitting booking app for a sole-trader business. Monorepo: `web/` (React frontend) and `api/` (Spring Boot backend). No auth yet.

**The project owner is the spec owner and reviewer; Claude is the coding agent.** All architectural decisions are made together — Claude proposes options with trade-offs, the project owner decides.

## Repo layout

- `web/` — React + Vite frontend (TypeScript). Folder-specific rules: `web/CLAUDE.md`.
- `api/` — Spring Boot REST API (Java), PostgreSQL + Flyway. Folder-specific rules: `api/CLAUDE.md`.
- Deploys are independent per package: Vercel deploys `web/` (root directory set to `web`), and GitHub Actions workflows are path-filtered (`web.yml` on `web/**`; `api.yml` on `api/**`).
- Design specs and implementation plans: `docs/superpowers/`.

## Planned additions (weeks 1–2)

- Spring Boot REST API (Java)
- PostgreSQL database with Flyway migrations
- Separate dev and prod databases
- Entities: clients, dogs, bookings + booking_stays, blocked_dates (payment is a `paid_at` column on bookings). Schema (V1) and booking API (JPA entities, `/clients`, `/bookings`) done; frontend switch-over next.

## Rules Claude must follow (apply across `web/` and `api/`)

### Before writing any code
- Read the relevant files first and summarise what you find.
- For schema or architecture decisions: walk through the options and trade-offs and wait for the project owner's choice before writing migrations or code.

### While writing code
- Write tests and run them; report results and any remaining risks.
- No new dependencies without approval.
- No commits or pushes without approval.
- Never touch production credentials or data. Dev and prod databases are strictly separate.
- No speculative features, no premature abstractions. Match scope to the approved task.
- Default to no comments; add one only when the WHY is non-obvious.

### Git
- Clean, descriptive commit messages. No "WIP" commits.
- Propose the commit message for approval before committing.

## Known tech debt / design gaps

Resolved in the backend schema (V1; see `docs/superpowers/specs/2026-10-29-backend-schema-design.md`). The `web/` frontend still uses the old shapes until it's wired to the API:

1. Owners and dogs were free text → `clients` and `dogs` tables.
2. Per-booking rate inputs → the rate used is snapshotted on each `booking_stays` row; no rates table.
3. No availability modelling → `blocked_dates` (warn only, no capacity limits).
4. Client-side timestamp IDs → database-generated `bigint` identity IDs.

Still open: auth (required before the API is reachable from the internet) and CORS (needed before `web/` can call the API).

## Future phases (for context)
- Weeks 3–4: automated WhatsApp confirmation + calendar sync
- Weeks 5–6: LLM feature — WhatsApp → draft booking (tool calling, structured output, RAG over policies)
- Weeks 7–8: evals, guardrails, audit logging, CI/CD
