# Dashboard tab design

**Date:** 2026-11-03
**Status:** approved 2026-11-03
**Builds on:** `2026-10-31-web-api-switch-design.md` (the website reads bookings from the API)

**Branch:** `feat/dashboard` (from `main`)

## Goal

Add a **Dashboard** tab to the website: a table of every stay, which the owner can sort, filter, search, rearrange and export to CSV.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Rows | One row per stay (`booking_stays`); each row repeats its booking's client, dog, notes and paid status | Sorting and filtering by date works per day; the CSV adds up in a spreadsheet |
| Grouping | Not included | Row grouping is paid in AG Grid (Enterprise) and MUI X (Premium); the owner chose not to need it |
| Grid library | AG Grid Community | Free (MIT). Multi-column sort, filters on several columns at once, column drag-reordering, show/hide and CSV export are all included. MUI X DataGrid's free tier allows one filter at a time and no column reordering |
| Data | No API changes. `App` already loads all bookings (with their stays nested) once on login and after each create/cancel; it passes the same list to History and Dashboard | No second request, and the two tabs can't drift apart. A flat `GET /api/stays` with server-side paging is only worth it at volumes a sole trader won't reach |
| Editing | Read-only; cancelling stays in History | Matches the approved scope |
| Cancelled stays | Shown, and filterable by Status | The dashboard is the full record |
| Default sort | Drop-off, soonest first | |

### New dependencies (approval given 2026-11-03)

Runtime, pinned exactly:
- `ag-grid-community` 36.2.0 (released 2026-09-16)
- `ag-grid-react` 36.2.0 (peer React `^19` supported)

They pull in `ag-stack`, `ag-charts-types` (types only) and `prop-types`.

## Columns

| Column | Source | Shown as | Filter |
|---|---|---|---|
| Booking # | `booking.id` | `42` | number |
| Client | `booking.client.name` | `Sarah Jones` | text |
| Dog | `booking.dog.name` | `Biscuit` | text |
| Service | `stay.service` | `Day Care` / `Boarding` (`SERVICE_LABEL`) | text |
| Drop-off | `stay.dropOffDate` + `dropOffTime` | `Mon, 8 Dec 2026 at 9:00 AM`, or `… (time TBD)` (`fmt`) | date |
| Pick-up | `stay.pickUpDate` + `pickUpTime` | as Drop-off | date |
| Nights | derived: pick-up date − drop-off date | `2` (0 = day care) | number |
| Unit rate | `stay.unitRate` | `£40.00` | number |
| Pickup/drop-off fee | `stay.pickupDropoffFee` | `£15.00` | number |
| Price | `stay.price` | `£95.00` | number |
| Status | `stay.status` | `Confirmed` / `Cancelled` | text |
| Paid | derived: `booking.paidAt !== null` | `Yes` / `No` | text |
| Booked on | `booking.createdAt` | `3 Nov 2026` | date |
| Notes | `booking.notes` | text, empty when null | text |

AG Grid's tick-list (set) filter is Enterprise-only, so Service, Status and Paid use the text filter.

Sorting uses the underlying values (dates and times, numbers), not the display text. Derived values are computed for display only; nothing new is stored.

## Layout

- A third tab, **Dashboard**, after History.
- On the Dashboard tab only, the page container widens from `sm` to `xl`; New Booking and History stay narrow.
- Above the grid: a quick search box (searches all columns) and an **Export CSV** button.
- The grid fills the width and about 70% of the viewport height. Column menus hold sort, filter and show/hide; columns reorder by dragging their headers.
- Theme: AG Grid's Quartz theme with the app's primary colour and font set through its theme parameters.
- No bookings: the same "No bookings yet" empty state as History.

## CSV export

- AG Grid's built-in `exportDataAsCsv`, which exports the rows as currently filtered and sorted, and the visible columns in their current order.
- Values are plain so a spreadsheet can calculate with them: Drop-off and Pick-up as `YYYY-MM-DD HH:mm` (`YYYY-MM-DD` when the time is TBD), Booked on as `YYYY-MM-DD`, money as numbers without `£`, Paid as `Yes`/`No`.
- File name: `dd-pet-care-stays-YYYY-MM-DD.csv` (today's date).

## Code

- `web/src/dashboard.ts`: `toStayRows(bookings)` flattens bookings into one `StayRow` per stay, and the column definitions with their display and CSV formatters. Pure functions.
- `web/src/components/Dashboard.tsx`: the grid, quick search and export button. Takes `bookings` as a prop.
- `web/src/App.tsx`: the Dashboard tab and the per-tab container width.
- `web/CLAUDE.md`: AG Grid in the stack list.

## Testing

- `dashboard.test.ts`: `toStayRows` for a multi-day booking, cancelled stays, paid and unpaid, TBD times, nights; the CSV formatters.
- `Dashboard.test.tsx`: rows render, quick search narrows them, Export CSV calls the export with the expected file name, empty state. jsdom has no layout; if AG Grid doesn't render rows there, these tests go through the grid API instead, and the test report says so.
- `App.test.tsx`: the Dashboard tab appears after login and shows the loaded bookings.
- `npm run typecheck`, `npm run lint` and `npm test` pass; check the tab by hand in the browser against the local API.

## Out of scope

- Row grouping and subtotals
- Editing or cancelling from the grid
- Saving column layout or filters between visits
- Server-side filtering or paging
