# CLAUDE.md — web/ (frontend)

Folder-specific rules for the React frontend. Shared project rules live in the root `CLAUDE.md` — read that first.

## Stack

- React 19 + Vite, MUI v9, dayjs — TypeScript, `strict: true` (see `tsconfig.json`)
- **TypeScript version:** pinned to `5.9.3`, not latest (`7.x`) — `typescript-eslint` doesn't support TS 7 yet. Re-check this pin before bumping TypeScript.
- **Deployed:** Vercel, root directory `web/`, auto-deploys on push to `main`
- **⚠️ Don't merge `feat/web-api` (the API-backed website) into `main` yet.** Two blockers: (1) the API and a production database aren't hosted, so the live site would break; (2) the owner's real bookings in the live site's browser storage need a migration plan first. Its PR stays a draft until both are done.
- **Data:** the `api/` backend, called through `src/api/client.ts` at relative `/api/...` URLs. In dev, Vite proxies `/api` to `http://localhost:8080`. The live Vercel site (`main`) still runs the old localStorage version until the API is hosted, so this branch isn't merged before then.
- **Booking submission:** one form submit creates one booking with one or more days (stays); client, dog, notes and rates are shared by its days.
- **Dev dependencies:** Test and codegen tools are dev-only and pinned exactly: openapi-typescript 7.13.0, vitest 4.1.12, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/user-event 14.6.8, jsdom 29.1.1, msw 2.15.0. They're the newest versions that run on CI's Node 20; vitest 5, jsdom 30 and msw 3 need Node 22.

## TypeScript

- All code is TypeScript (`.ts`/`.tsx`), no new `.js`/`.jsx` files. Run `npm run typecheck` before considering work done — `strict: true` must stay passing, don't weaken it to silence errors.

## MUI components

- Only `Box` accepts CSS-shaped props (`mb`, `fontWeight`, `display`, etc.) directly. All other MUI components (`Stack`, `Typography`, `Button`, ...) silently ignore them — always use `sx={{ ... }}` instead.
- Confirmation prompts use an MUI `Dialog` with explicit action labels (e.g. 'Keep booking' / 'Cancel booking'), not `window.confirm`.

## API types

- `src/api/schema.d.ts` is generated from the API's `/v3/api-docs` by `npm run gen:api` (the API must be running; restart it after changing its annotations). It's committed; never edit it by hand. ESLint ignores it.
- `src/types.ts` gives the generated schemas short names (`Booking`, `Stay`, `Client`, `Dog`, `CreateBookingRequest`, …) and holds the form-only types (`BookingDraft`, `ClientChoice`, `DogChoice`, field-error shapes).
- `src/api/client.ts` is the only place that calls `fetch`. A non-2xx response or a network failure throws `ApiError` (`status` 0 for network), with `fieldErrors` and `existingClient` from the problem body. `client.ts` only ever throws `ApiError`. A 502/503/504 with no problem body (the Vite proxy when the API isn't running) is reported as status 0, "Could not reach the server".
- `src/phone.ts` turns typed numbers into E.164 (`07…`/`447…`/`00…`/`+44 (0)…` → `+44…`; UK mobiles must be `+447` plus 9 digits); anything else must already be valid E.164.

## Tests

- `npm test` runs Vitest (jsdom). It also runs in CI. Vitest doesn't typecheck; `npm run typecheck` does.
- Tests sit next to the code (`*.test.ts(x)`). MSW fakes the API: add handlers per test with `server.use(http.get('/api/...', ...))`. Unhandled requests fail the test.
- Render components that use date pickers with `{ wrapper: Providers }` (`src/test/Providers.tsx`). Set a picker's date by firing `change` on its hidden input: `getAllByLabelText('Drop-off Date', { selector: 'input' })`, value in `DD/MM/YYYY` (or `DD/MM/YYYY HH:mm` with times).
- No jest-dom: assert with `getBy*`/`queryBy*`, `toBeTruthy()`, `toBeNull()` and input `.value`.
- After closing a `Dialog`, wait until it's gone (`queryByRole('dialog', { hidden: true })` is null) before querying the page; while it fades out, the rest of the page is aria-hidden.
- Sample API data lives in `src/test/fixtures.ts`.
