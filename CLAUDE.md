# CLAUDE.md — DD Pet Care Booking

## Project context

A dog-sitting booking app for a sole-trader business. Monorepo: `web/` (React frontend) and `api/` (Spring Boot backend, planned — see below). No auth yet.

**The project owner is the spec owner and reviewer; Claude is the coding agent.** All architectural decisions are made together — Claude proposes options with trade-offs, the project owner decides.

## Repo layout

- `web/` — React + Vite frontend (TypeScript). Folder-specific rules: `web/CLAUDE.md`.
- `api/` — Spring Boot REST API (Java), PostgreSQL + Flyway. Not created yet; will get its own `api/CLAUDE.md` when it is.
- Deploys are independent per package: Vercel deploys `web/` (root directory set to `web`), and GitHub Actions workflows are path-filtered (`web.yml` on `web/**`; `api.yml` on `api/**` once `api/` exists).

## Planned additions (weeks 1–2)

- Spring Boot REST API (Java)
- PostgreSQL database with Flyway migrations
- Separate dev and prod databases
- Entities: clients, dogs, bookings, availability, payments

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

## Known tech debt / design gaps to resolve in the backend

1. Owners and dogs are free-text fields — backend needs proper `clients` and `dogs` tables.
2. Rates are per-booking form inputs (default £35/day, £40/night) — backend needs a decision: central `rates` config table, or snapshot rates on the booking row?
3. No availability / capacity modelling — to be designed.
4. Client-side IDs are timestamps — backend uses auto-increment or UUID.

## Future phases (for context)
- Weeks 3–4: automated WhatsApp confirmation + calendar sync
- Weeks 5–6: LLM feature — WhatsApp → draft booking (tool calling, structured output, RAG over policies)
- Weeks 7–8: evals, guardrails, audit logging, CI/CD
