# CLAUDE.md — web/ (frontend)

Folder-specific rules for the React frontend. Shared project rules live in the root `CLAUDE.md` — read that first.

## Stack

- React 19 + Vite, MUI v9, dayjs — TypeScript, `strict: true` (see `tsconfig.json`)
- **TypeScript version:** pinned to `5.9.3`, not latest (`7.x`) — `typescript-eslint` doesn't support TS 7 yet. Re-check this pin before bumping TypeScript.
- **Deployed:** Vercel, root directory `web/`, auto-deploys on push to `main`
- **Persistence:** localStorage (temporary; being replaced by the `api/` backend)
- **Booking submission:** one form submit can create multiple bookings at once (shared dog/owner/rates, one `BookingEntry` per stay) — `onSubmit` always receives an array, even for a single booking

## TypeScript

- All code is TypeScript (`.ts`/`.tsx`), no new `.js`/`.jsx` files. Run `npm run typecheck` before considering work done — `strict: true` must stay passing, don't weaken it to silence errors.

## MUI components

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

Once the `api/` backend's OpenAPI spec exists, this section will be replaced by generated TS types.
