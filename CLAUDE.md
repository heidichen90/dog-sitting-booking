# CLAUDE.md — DD Pet Care Booking

## Project context

A dog-sitting booking app for a sole-trader business. Currently React + Vite frontend only (no backend, no auth). Being developed as a learning project for an 8-week AI-enabled full-stack engineer curriculum, targeting bank engineering roles.

**Heidi is the spec owner and reviewer; Claude is the coding agent.** All architectural decisions are made together — Claude proposes options with trade-offs, Heidi decides.

## Current stack

- **Frontend:** React 19 + Vite, MUI v9, dayjs — TypeScript, `strict: true` (see `tsconfig.json`)
- **TypeScript version:** pinned to `5.9.3`, not latest (`7.x`) — `typescript-eslint` doesn't support TS 7 yet. Re-check this pin before bumping TypeScript.
- **Deployed:** Vercel (frontend only), auto-deploys on push to `main`
- **Persistence:** localStorage (temporary; being replaced by backend)
- **Calendar/date convention:** British — week starts Monday, dates display as DD/MM/YYYY (`adapterLocale="en-gb"` in `main.tsx`)
- **Booking submission:** one form submit can create multiple bookings at once (shared dog/owner/rates, one `BookingEntry` per stay) — `onSubmit` always receives an array, even for a single booking

## Planned additions (weeks 1–2)

- Spring Boot REST API (Java)
- PostgreSQL database with Flyway migrations
- Separate dev and prod databases
- Entities: clients, dogs, bookings, availability, payments

## Rules Claude must follow

### Before writing any code
- Read the relevant files first and summarise what you find.
- For schema or architecture decisions: walk through the options and trade-offs and wait for Heidi's choice before writing migrations or code.
- Propose a plan and get explicit approval before implementing anything non-trivial.

### While writing code
- Write tests and run them; report results and any remaining risks.
- No new dependencies without approval.
- No commits or pushes without approval.
- Never touch production credentials or data. Dev and prod databases are strictly separate.
- No speculative features, no premature abstractions. Match scope to the approved task.
- Default to no comments; add one only when the WHY is non-obvious.
- All code is TypeScript (`.ts`/`.tsx`), no new `.js`/`.jsx` files. Run `npm run typecheck` before considering work done — `strict: true` must stay passing, don't weaken it to silence errors.

### Git
- Clean, descriptive commit messages. No "WIP" commits.
- Propose the commit message for approval before committing.

### MUI components
- Only `Box` accepts CSS-shaped props (`mb`, `fontWeight`, `display`, etc.) directly. All other MUI components (`Stack`, `Typography`, `Button`, ...) silently ignore them — always use `sx={{ ... }}` instead.

## Data shape (current frontend)

Types live in `src/types.ts` — treat it as the source of truth, not this doc. Two distinct shapes:

- **`Booking`** — a saved/submitted booking (what's persisted to localStorage). `dropOff`/`pickUp` are ISO strings, `service` is `"Day Care" | "Boarding" | ""`, `id`/`price`/etc. are plain `number`.
- **`BookingDraft`** — one in-progress entry in the form before submission. `dropOff`/`pickUp` are `Dayjs | null` (not yet validated into ISO strings).

```
Booking {
  id: number,           // Date.now() — will become DB-generated PK
  dogName: string,      // free text — will become FK to dogs table
  ownerName: string,    // free text — will become FK to clients table
  service: "Day Care" | "Boarding" | "",
  dropOff: ISO string,
  pickUp: ISO string,
  timesTbd: boolean,
  price: number,        // calculated client-side from rates
  notes: string,
  pickupDropoff: boolean,
  createdAt: ISO string
}
```

## Known tech debt / design gaps to resolve in the backend

1. Owners and dogs are free-text fields — backend needs proper `clients` and `dogs` tables.
2. Rates are per-booking form inputs (default £35/day, £40/night) — backend needs a decision: central `rates` config table, or snapshot rates on the booking row?
3. No availability / capacity modelling — to be designed.
4. No payment status — `price` is calculated but never tracked as paid/outstanding.
5. Client-side IDs are timestamps — backend uses auto-increment or UUID.

## Future phases (for context)
- Weeks 3–4: automated WhatsApp confirmation + calendar sync
- Weeks 5–6: LLM feature — WhatsApp → draft booking (tool calling, structured output, RAG over policies)
- Weeks 7–8: evals, guardrails, audit logging, CI/CD
