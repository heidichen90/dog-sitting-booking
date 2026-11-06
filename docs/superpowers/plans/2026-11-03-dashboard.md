# Dashboard Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Dashboard tab to the website: an AG Grid table with one row per stay that sorts, filters, searches, reorders and hides columns, and exports to CSV.

**Architecture:** `web/src/dashboard.ts` turns the bookings `App` already loads into flat `StayRow`s and holds the grid's column definitions and formatters (pure, unit-tested). `web/src/components/Dashboard.tsx` renders AG Grid Community with a search box, a Columns menu (Community has no built-in column chooser) and an Export CSV button. Export takes the CSV text from `api.getDataAsCsv()` and downloads it through a shared `downloadFile` helper, because AG Grid's own download click crashes under jsdom. `App` adds the tab and lazy-loads `Dashboard`, so the grid (about 245 KB gzipped) downloads only when the tab is first opened.

**Tech Stack:** React 19.2, Vite 8, MUI 9, dayjs, TypeScript 5.9.3, Vitest 4.1.12 + Testing Library + MSW. New runtime: `ag-grid-community` 36.2.0, `ag-grid-react` 36.2.0 (approved 2026-11-03).

**Spec:** docs/superpowers/specs/2026-11-03-dashboard-design.md

**Branch:** `feat/dashboard` (already created from `main`; the spec is committed on it). Check `git branch --show-current` before every commit.

**Verified beforehand:** every code block below was run in a scratch copy of `web/` on 2026-11-03: 108 tests pass, `typecheck` and `lint` are clean, and the build is `index` 231 KB + `Dashboard` 245 KB gzipped (231 KB before this work).

All commands run from `web/`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `web/package.json`, `web/package-lock.json` | Modify | The two AG Grid packages, pinned exactly |
| `web/src/dashboard.ts` | Create | `StayRow`, `toStayRows`, formatters, `compareDay`, `COLUMNS`, `csvFileName` |
| `web/src/dashboard.test.ts` | Create | Unit tests for the above |
| `web/src/components/NoBookings.tsx` | Create | "No bookings yet" empty state, shared by History and Dashboard |
| `web/src/components/BookingHistory.tsx` | Modify | Use `NoBookings` |
| `web/src/utils.ts` | Modify | `downloadFile(blob, fileName)`; `downloadICS` uses it |
| `web/src/components/Dashboard.tsx` | Create | The grid, search, Columns menu, Export CSV |
| `web/src/components/Dashboard.test.tsx` | Create | Component tests |
| `web/src/App.tsx` | Modify | Dashboard tab, `xl` width on that tab, lazy load |
| `web/src/App.test.tsx` | Modify | Dashboard tab test |
| `web/CLAUDE.md` | Modify | AG Grid in the stack; dashboard notes |
| `docs/superpowers/specs/2026-11-03-dashboard-design.md` | Modify | Sync with what was built |

---

### Task 1: Add AG Grid

**Files:**
- Modify: `web/package.json`, `web/package-lock.json`

- [ ] **Step 1: Install, pinned exactly**

Run: `npm install --save-exact ag-grid-community@36.2.0 ag-grid-react@36.2.0`

Expected: `package.json` `dependencies` gains `"ag-grid-community": "36.2.0"` and `"ag-grid-react": "36.2.0"` (no `^`).

- [ ] **Step 2: Check nothing broke**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass (93 tests, as on `main`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(web): add AG Grid Community for the dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Stay rows and column definitions

**Files:**
- Create: `web/src/dashboard.ts`
- Test: `web/src/dashboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `web/src/dashboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { compareDay, csvFileName, formatDateTime, formatMoney, toStayRows } from './dashboard.ts'
import { booking, cancelledBooking } from './test/fixtures.ts'

describe('toStayRows', () => {
  it('makes one row per stay, carrying the booking details onto each', () => {
    const rows = toStayRows([booking, cancelledBooking])

    expect(rows.map((r) => r.stayId)).toEqual([31, 32, 33])
    expect(rows[0]).toEqual({
      stayId: 31,
      bookingId: 12,
      client: 'Sarah Lee',
      dog: 'Biscuit',
      service: 'Boarding',
      dropOff: '2030-11-02 09:00',
      pickUp: '2030-11-04',
      nights: 2,
      unitRate: 40,
      pickupDropoffFee: 15,
      price: 95,
      status: 'Confirmed',
      paid: 'No',
      bookedOn: '2030-10-30',
      notes: 'Allergic to chicken',
    })
    expect(rows[1]).toMatchObject({ bookingId: 12, service: 'Day Care', nights: 0, notes: 'Allergic to chicken' })
  })

  it('keeps cancelled stays, with no notes as an empty string', () => {
    const [row] = toStayRows([cancelledBooking])

    expect(row).toMatchObject({ status: 'Cancelled', dropOff: '2030-11-12', pickUp: '2030-11-12', notes: '' })
  })

  it('marks a paid booking', () => {
    const [row] = toStayRows([{ ...booking, paidAt: '2030-11-05T10:00:00Z' }])

    expect(row.paid).toBe('Yes')
  })

  it('returns no rows for no bookings', () => {
    expect(toStayRows([])).toEqual([])
  })
})

describe('formatters', () => {
  it('shows a date with its time, or "(time TBD)" without one', () => {
    expect(formatDateTime('2030-11-02 09:00')).toBe('Sat, 2 Nov 2030 at 9:00 AM')
    expect(formatDateTime('2030-11-04')).toBe('Mon, 4 Nov 2030 (time TBD)')
  })

  it('shows money in pounds with pence', () => {
    expect(formatMoney(95)).toBe('£95.00')
    expect(formatMoney(12.5)).toBe('£12.50')
  })
})

describe('compareDay', () => {
  const day = dayjs('2030-11-02').toDate()

  it('matches the same day whatever the time', () => {
    expect(compareDay(day, '2030-11-02 09:00')).toBe(0)
    expect(compareDay(day, '2030-11-02')).toBe(0)
  })

  it('orders other days before or after', () => {
    expect(compareDay(day, '2030-11-01 23:00')).toBe(-1)
    expect(compareDay(day, '2030-11-03')).toBe(1)
  })
})

describe('csvFileName', () => {
  it("names the file with today's date", () => {
    expect(csvFileName(dayjs('2026-11-03'))).toBe('dd-pet-care-stays-2026-11-03.csv')
  })
})
```

- [ ] **Step 2: Run them to check they fail**

Run: `npx vitest run src/dashboard.test.ts`
Expected: FAIL, `Failed to resolve import "./dashboard.ts"`.

- [ ] **Step 3: Write `dashboard.ts`**

Create `web/src/dashboard.ts`:

```ts
import dayjs from 'dayjs'
import type { ColDef, ValueFormatterParams } from 'ag-grid-community'
import { SERVICE_LABEL, fmt } from './utils.ts'
import type { Booking } from './types'

/** One stay with its booking's details, as shown in the dashboard grid and its CSV. */
export interface StayRow {
  stayId: number
  bookingId: number
  client: string
  dog: string
  service: string
  dropOff: string
  pickUp: string
  nights: number
  unitRate: number
  pickupDropoffFee: number
  price: number
  status: string
  paid: string
  bookedOn: string
  notes: string
}

const STATUS_LABEL = { confirmed: 'Confirmed', cancelled: 'Cancelled' } as const

// "YYYY-MM-DD HH:mm", or "YYYY-MM-DD" when the time is TBD: sorts in time order and is the CSV value.
function dateTime(date: string, time: string | null): string {
  return time ? `${date} ${time}` : date
}

export function toStayRows(bookings: Booking[]): StayRow[] {
  return bookings.flatMap((b) =>
    b.stays.map((s) => ({
      stayId: s.id,
      bookingId: b.id,
      client: b.client.name,
      dog: b.dog.name,
      service: SERVICE_LABEL[s.service],
      dropOff: dateTime(s.dropOffDate, s.dropOffTime),
      pickUp: dateTime(s.pickUpDate, s.pickUpTime),
      nights: dayjs(s.pickUpDate).diff(dayjs(s.dropOffDate), 'day'),
      unitRate: s.unitRate,
      pickupDropoffFee: s.pickupDropoffFee,
      price: s.price,
      status: STATUS_LABEL[s.status],
      paid: b.paidAt ? 'Yes' : 'No',
      bookedOn: dayjs(b.createdAt).format('YYYY-MM-DD'),
      notes: b.notes ?? '',
    })),
  )
}

export function formatDateTime(value: string): string {
  const [date, time] = value.split(' ')
  return fmt(date, time ?? null)
}

export function formatMoney(value: number): string {
  return `£${value.toFixed(2)}`
}

/** Matches a "YYYY-MM-DD…" cell against the date filter's chosen day, ignoring the time. */
export function compareDay(filterDate: Date, cellValue: string): number {
  const cellDay = dayjs(cellValue.slice(0, 10)).valueOf()
  const filterDay = filterDate.getTime()
  return cellDay < filterDay ? -1 : cellDay > filterDay ? 1 : 0
}

const dateTimeLabel = ({ value }: { value?: string | null }) => (value ? formatDateTime(value) : '')

const dateTimeColumn: ColDef<StayRow> = {
  minWidth: 230,
  filter: 'agDateColumnFilter',
  filterParams: { comparator: compareDay },
  valueFormatter: dateTimeLabel,
  getQuickFilterText: dateTimeLabel,
}

const moneyColumn: ColDef<StayRow> = {
  filter: 'agNumberColumnFilter',
  valueFormatter: ({ value }: ValueFormatterParams<StayRow, number>) => (value == null ? '' : formatMoney(value)),
}

export const COLUMNS: ColDef<StayRow>[] = [
  { field: 'bookingId', headerName: 'Booking #', filter: 'agNumberColumnFilter', width: 120 },
  { field: 'client', headerName: 'Client', filter: 'agTextColumnFilter' },
  { field: 'dog', headerName: 'Dog', filter: 'agTextColumnFilter' },
  { field: 'service', headerName: 'Service', filter: 'agTextColumnFilter', width: 130 },
  { field: 'dropOff', headerName: 'Drop-off', sort: 'asc', ...dateTimeColumn },
  { field: 'pickUp', headerName: 'Pick-up', ...dateTimeColumn },
  { field: 'nights', headerName: 'Nights', filter: 'agNumberColumnFilter', width: 110 },
  { field: 'unitRate', headerName: 'Unit rate', width: 120, ...moneyColumn },
  { field: 'pickupDropoffFee', headerName: 'Pickup/drop-off fee', width: 170, ...moneyColumn },
  { field: 'price', headerName: 'Price', width: 110, ...moneyColumn },
  { field: 'status', headerName: 'Status', filter: 'agTextColumnFilter', width: 130 },
  { field: 'paid', headerName: 'Paid', filter: 'agTextColumnFilter', width: 100 },
  {
    field: 'bookedOn',
    headerName: 'Booked on',
    filter: 'agDateColumnFilter',
    filterParams: { comparator: compareDay },
    valueFormatter: ({ value }) => (value ? dayjs(value).format('D MMM YYYY') : ''),
    width: 140,
  },
  { field: 'notes', headerName: 'Notes', filter: 'agTextColumnFilter', minWidth: 200, flex: 1 },
]

export function csvFileName(today: dayjs.Dayjs = dayjs()): string {
  return `dd-pet-care-stays-${today.format('YYYY-MM-DD')}.csv`
}
```

Why the rows hold strings: Service, Status and Paid are stored as their display labels, so the text filter, quick search, sort and CSV all see the same words. Drop-off and Pick-up are `YYYY-MM-DD HH:mm` strings, which sort correctly as text, are the CSV value, and are formatted for display by `formatDateTime`.

- [ ] **Step 4: Run the tests to check they pass**

Run: `npx vitest run src/dashboard.test.ts && npm run typecheck`
Expected: 9 tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard.ts src/dashboard.test.ts
git commit -m "feat(web): add stay rows and columns for the dashboard grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Share the empty state and the file download

A refactor with no behaviour change. The existing tests cover it.

**Files:**
- Create: `web/src/components/NoBookings.tsx`
- Modify: `web/src/components/BookingHistory.tsx:16,29-37`
- Modify: `web/src/utils.ts` (the `downloadICS` function at the end of the file)

- [ ] **Step 1: Create `NoBookings.tsx`**

```tsx
import { Box, Typography } from '@mui/material'
import PetsIcon from '@mui/icons-material/Pets'

export default function NoBookings() {
  return (
    <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
      <PetsIcon sx={{ fontSize: 64, mb: 1 }} />
      <Typography variant="h6">No bookings yet</Typography>
      <Typography variant="body2">Create your first booking to get started.</Typography>
    </Box>
  )
}
```

- [ ] **Step 2: Use it in `BookingHistory.tsx`**

Replace the import `import PetsIcon from '@mui/icons-material/Pets'` with nothing, and after `import dayjs from 'dayjs'` add:

```tsx
import NoBookings from './NoBookings.tsx'
```

Replace the empty-state block:

```tsx
  if (!bookings.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
        <PetsIcon sx={{ fontSize: 64, mb: 1 }} />
        <Typography variant="h6">No bookings yet</Typography>
        <Typography variant="body2">Create your first booking to get started.</Typography>
      </Box>
    )
  }
```

with:

```tsx
  if (!bookings.length) {
    return <NoBookings />
  }
```

`Box` and `Typography` stay imported; the cards still use them.

- [ ] **Step 3: Pull `downloadFile` out of `downloadICS` in `utils.ts`**

Replace:

```ts
export function downloadICS(booking: Booking, stay: Stay): void {
  const blob = new Blob([buildICS(booking, stay)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${booking.dog.name.toLowerCase().replace(/\s+/g, "-")}-sitting.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

with:

```ts
export function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadICS(booking: Booking, stay: Stay): void {
  const blob = new Blob([buildICS(booking, stay)], { type: "text/calendar;charset=utf-8" });
  downloadFile(blob, `${booking.dog.name.toLowerCase().replace(/\s+/g, "-")}-sitting.ics`);
}
```

(`utils.ts` uses double quotes and semicolons; keep its style.)

- [ ] **Step 4: Check nothing changed**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass; the `BookingHistory` empty-state test still finds "No bookings yet".

- [ ] **Step 5: Commit**

```bash
git add src/components/NoBookings.tsx src/components/BookingHistory.tsx src/utils.ts
git commit -m "refactor(web): share the empty state and file download helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Dashboard component

**Files:**
- Create: `web/src/components/Dashboard.tsx`
- Test: `web/src/components/Dashboard.test.tsx`

Testing notes, learned in the spike:
- AG Grid renders rows and headers under jsdom (it virtualises, but these fixtures are small).
- AG Grid's own `exportDataAsCsv` crashes in jsdom (`Failed to construct 'MouseEvent'`), which is why the component calls `getDataAsCsv()` plus `downloadFile`, and the test mocks `downloadFile`.
- `Blob.text()` drops a leading byte-order mark, so the test decodes with `ignoreBOM: true`.
- An open MUI `Menu` makes the rest of the page aria-hidden, so the Columns test closes the menu before looking at the grid. Without that, "header is gone" passes for the wrong reason.

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/Dashboard.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Dashboard from './Dashboard.tsx'
import { downloadFile } from '../utils.ts'
import { booking, cancelledBooking } from '../test/fixtures.ts'

vi.mock('../utils.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils.ts')>()),
  downloadFile: vi.fn(),
}))

const rowWith = (text: string) => screen.queryAllByRole('row').find((r) => within(r).queryByText(text))

// The open menu makes the rest of the page aria-hidden, so close it before querying the grid.
async function toggleColumn(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Columns' }))
  await user.click(screen.getByRole('menuitem', { name }))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('menu', { hidden: true })).toBeNull())
}

describe('Dashboard', () => {
  beforeEach(() => vi.mocked(downloadFile).mockClear())

  it('shows one row per stay with formatted values, soonest drop-off first', async () => {
    render(<Dashboard bookings={[cancelledBooking, booking]} />)

    await waitFor(() => expect(screen.getAllByText('Biscuit')).toHaveLength(2))
    const first = rowWith('Sat, 2 Nov 2030 at 9:00 AM')
    expect(first).toBeTruthy()
    expect(within(first!).getByText('Mon, 4 Nov 2030 (time TBD)')).toBeTruthy()
    expect(within(first!).getByText('£95.00')).toBeTruthy()
    expect(within(first!).getByText('Boarding')).toBeTruthy()
    expect(rowWith('Rex')).toBeTruthy()
    expect(within(rowWith('Rex')!).getByText('Cancelled')).toBeTruthy()

    const dropOffs = screen
      .getAllByRole('gridcell')
      .filter((c) => c.getAttribute('col-id') === 'dropOff')
      .map((c) => c.textContent)
    expect(dropOffs).toEqual([
      'Sat, 2 Nov 2030 at 9:00 AM',
      'Sun, 10 Nov 2030 at 8:30 AM',
      'Tue, 12 Nov 2030 (time TBD)',
    ])
  })

  it('narrows the rows with the search box', async () => {
    const user = userEvent.setup()
    render(<Dashboard bookings={[booking, cancelledBooking]} />)
    await waitFor(() => expect(screen.getByText('Rex')).toBeTruthy())

    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'rex')

    await waitFor(() => expect(screen.queryByText('Biscuit')).toBeNull())
    expect(screen.getByText('Rex')).toBeTruthy()
  })

  it('hides and shows a column from the Columns menu', async () => {
    const user = userEvent.setup()
    render(<Dashboard bookings={[booking]} />)
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Notes/ })).toBeTruthy())

    await toggleColumn(user, 'Notes')
    expect(screen.queryByRole('columnheader', { name: /Notes/ })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /Dog/ })).toBeTruthy()

    await toggleColumn(user, 'Notes')
    expect(screen.getByRole('columnheader', { name: /Notes/ })).toBeTruthy()
  })

  it('exports the shown rows as CSV with plain values', async () => {
    const user = userEvent.setup()
    render(<Dashboard bookings={[booking, cancelledBooking]} />)
    await waitFor(() => expect(screen.getByText('Rex')).toBeTruthy())
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'biscuit')
    await waitFor(() => expect(screen.queryByText('Rex')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    expect(downloadFile).toHaveBeenCalledOnce()
    const [blob, fileName] = vi.mocked(downloadFile).mock.calls[0]
    expect(fileName).toMatch(/^dd-pet-care-stays-\d{4}-\d{2}-\d{2}\.csv$/)
    // Blob.text() would drop the byte-order mark, so decode keeping it.
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer())
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      '"Booking #","Client","Dog","Service","Drop-off","Pick-up","Nights","Unit rate","Pickup/drop-off fee","Price","Status","Paid","Booked on","Notes"',
    )
    expect(lines[1]).toBe(
      '"12","Sarah Lee","Biscuit","Boarding","2030-11-02 09:00","2030-11-04","2","40","15","95","Confirmed","No","2030-10-30","Allergic to chicken"',
    )
  })

  it('shows the empty state with no bookings', () => {
    render(<Dashboard bookings={[]} />)

    expect(screen.getByText('No bookings yet')).toBeTruthy()
    expect(screen.queryByRole('grid')).toBeNull()
  })
})
```

Check the escapes: the file must contain the six characters `\uFEFF`, not an invisible byte-order mark. Check with `grep -n 'FEFF' src/components/Dashboard.test.tsx`.

- [ ] **Step 2: Run them to check they fail**

Run: `npx vitest run src/components/Dashboard.test.tsx`
Expected: FAIL, `Failed to resolve import "./Dashboard.tsx"`.

- [ ] **Step 3: Write `Dashboard.tsx`**

Create `web/src/components/Dashboard.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react'
import { Box, Button, Checkbox, ListItemText, Menu, MenuItem, Stack, TextField } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import DownloadIcon from '@mui/icons-material/Download'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import { AgGridReact } from 'ag-grid-react'
import {
  ClientSideRowModelModule,
  ColumnApiModule,
  CsvExportModule,
  DateFilterModule,
  ModuleRegistry,
  NumberFilterModule,
  QuickFilterModule,
  TextFilterModule,
  themeQuartz,
} from 'ag-grid-community'
import NoBookings from './NoBookings.tsx'
import { COLUMNS, csvFileName, toStayRows, type StayRow } from '../dashboard.ts'
import { downloadFile } from '../utils.ts'
import type { Booking } from '../types'

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ColumnApiModule,
  CsvExportModule,
  DateFilterModule,
  NumberFilterModule,
  QuickFilterModule,
  TextFilterModule,
])

interface DashboardProps {
  bookings: Booking[]
}

export default function Dashboard({ bookings }: DashboardProps) {
  const grid = useRef<AgGridReact<StayRow>>(null)
  const muiTheme = useTheme()
  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState<string[]>([])
  const [columnsMenu, setColumnsMenu] = useState<HTMLElement | null>(null)

  const rows = useMemo(() => toStayRows(bookings), [bookings])
  const theme = useMemo(
    () =>
      themeQuartz.withParams({
        accentColor: muiTheme.palette.primary.main,
        fontFamily: muiTheme.typography.fontFamily,
      }),
    [muiTheme],
  )

  if (!bookings.length) return <NoBookings />

  function toggleColumn(field: string) {
    const show = hidden.includes(field)
    grid.current?.api.setColumnsVisible([field], show)
    setHidden(show ? hidden.filter((f) => f !== field) : [...hidden, field])
  }

  function exportCsv() {
    const csv = grid.current?.api.getDataAsCsv()
    // The byte-order mark makes Excel read the file as UTF-8.
    if (csv) downloadFile(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), csvFileName())
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          label="Search"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flexGrow: 1, bgcolor: 'background.paper' }}
        />
        <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={(e) => setColumnsMenu(e.currentTarget)}>
          Columns
        </Button>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={exportCsv}>
          Export CSV
        </Button>
      </Stack>

      <Menu anchorEl={columnsMenu} open={columnsMenu !== null} onClose={() => setColumnsMenu(null)}>
        {COLUMNS.map(({ field, headerName }) =>
          field ? (
            <MenuItem key={field} dense onClick={() => toggleColumn(field)}>
              <Checkbox size="small" checked={!hidden.includes(field)} tabIndex={-1} disableRipple />
              <ListItemText primary={headerName} />
            </MenuItem>
          ) : null,
        )}
      </Menu>

      <Box sx={{ height: '70vh' }}>
        <AgGridReact<StayRow>
          ref={grid}
          theme={theme}
          rowData={rows}
          columnDefs={COLUMNS}
          defaultColDef={{ sortable: true, resizable: true, useValueFormatterForExport: false }}
          getRowId={({ data }) => String(data.stayId)}
          quickFilterText={search}
        />
      </Box>
    </Stack>
  )
}
```

Notes:
- Register only the modules used, not `AllCommunityModule`, to keep the bundle smaller. Column drag-reordering is built into the core.
- `useValueFormatterForExport: false` makes the CSV use the raw row values (`2030-11-02 09:00`, `95`), not the display text (`Sat, 2 Nov…`, `£95.00`).
- `getDataAsCsv()` exports what's on screen: rows after search and filters, in the current sort, and only the visible columns in their current order.
- Check `grep -n 'FEFF' src/components/Dashboard.tsx` shows the escape `'\uFEFF'`, not an invisible character.

- [ ] **Step 4: Run the tests to check they pass**

Run: `npx vitest run src/components/Dashboard.test.tsx && npm run typecheck && npm run lint`
Expected: 5 tests PASS; typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx src/components/Dashboard.test.tsx
git commit -m "feat(web): add the dashboard grid with search, columns and CSV export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Dashboard tab

**Files:**
- Modify: `web/src/App.tsx:1,21,181-184,190,235`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

In `web/src/App.test.tsx`, add this test directly before `it('shows the confirmation from the API response, then refreshes the lists'`:

```tsx
  it('shows every stay in the Dashboard tab', async () => {
    serveMe()
    serveLists(() => [booking, cancelledBooking])
    render(<App />, { wrapper: Providers })

    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Dashboard' }))

    await waitFor(() => expect(screen.getAllByRole('gridcell', { name: /^(Biscuit|Rex)$/ })).toHaveLength(3))
  })
```

- [ ] **Step 2: Run it to check it fails**

Run: `npx vitest run src/App.test.tsx -t "Dashboard tab"`
Expected: FAIL, unable to find role "tab" with name "Dashboard".

- [ ] **Step 3: Add the tab to `App.tsx`**

Change the React import:

```tsx
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
```

Directly above `type Session = 'checking' | 'loggedOut' | 'loggedIn'`, add:

```tsx
// Loaded on first open, so the grid library isn't downloaded with the rest of the site.
const Dashboard = lazy(() => import('./components/Dashboard.tsx'))

```

After `<Tab label={`History (${confirmedCount})`} />`, add:

```tsx
              <Tab label="Dashboard" />
```

Change the page container (the one with `sx={{ py: 3 }}`; leave the tabs bar's container at `sm`):

```tsx
        <Container maxWidth={tab === 2 ? 'xl' : 'sm'} sx={{ py: 3 }}>
```

After `{loaded && tab === 1 && <BookingHistory bookings={bookings} onCancel={handleCancel} />}`, add:

```tsx

          {loaded && tab === 2 && (
            <Suspense fallback={<CircularProgress aria-label="Loading" />}>
              <Dashboard bookings={bookings} />
            </Suspense>
          )}
```

`signOut()` already sets `tab` back to 0, so logging out leaves the Dashboard.

- [ ] **Step 4: Run all checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass, 108 tests (93 on `main` + 9 from Task 2 + 5 from Task 4 + 1 here).

- [ ] **Step 5: Check the bundle split**

Run: `npm run build`
Expected: two JS chunks: `index-*.js` about 231 KB gzipped (the same as before) and `Dashboard-*.js` about 245 KB gzipped. Vite's "chunk larger than 500 kB" warning was already there on `main`.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(web): add the Dashboard tab, loaded on first open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Docs and a check in the browser

**Files:**
- Modify: `web/CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-11-03-dashboard-design.md`

- [ ] **Step 1: `web/CLAUDE.md`**

Change the Stack line `- React 19 + Vite, MUI v9, dayjs — TypeScript, \`strict: true\` (see \`tsconfig.json\`)` to:

```markdown
- React 19 + Vite, MUI v9, dayjs, AG Grid Community 36.2.0 (pinned exactly; Dashboard tab only) — TypeScript, `strict: true` (see `tsconfig.json`)
```

Add at the end of the `## Tests` section:

```markdown
- AG Grid renders under jsdom. Its own `exportDataAsCsv` download crashes there, so `Dashboard` exports with `getDataAsCsv()` + `downloadFile` and its test mocks `downloadFile`. Close an open MUI `Menu` before querying the grid: while it's open the rest of the page is aria-hidden.
```

- [ ] **Step 2: Sync the spec with what was built**

In `docs/superpowers/specs/2026-11-03-dashboard-design.md`:

Under `## Layout`, replace `- Above the grid: a quick search box (searches all columns) and an **Export CSV** button.` and the next bullet (`Column menus hold sort, filter and show/hide…`) with:

```markdown
- Above the grid: a quick search box (searches all columns), a **Columns** menu with a tick box per column to show or hide it (AG Grid Community has no built-in column chooser), and an **Export CSV** button.
- The grid fills the width and is 70% of the viewport tall. Click a header to sort, shift-click to sort by more than one column; the header menu holds the filter; drag headers to reorder.
- The Dashboard code (and AG Grid) loads the first time the tab opens, so the rest of the site downloads no more than before.
```

Under `## CSV export`, replace the first bullet with:

```markdown
- The grid's `getDataAsCsv()` gives the rows as currently searched, filtered and sorted, with the visible columns in their current order. The site downloads it itself (`downloadFile`, shared with the calendar download), starting with a UTF-8 byte-order mark so Excel reads names correctly.
```

- [ ] **Step 3: Check in the browser against the local API**

Start Postgres.app, then the API (`cd ../api && ./mvnw spring-boot:run`, as in `api/CLAUDE.md`), then `npm run dev`. Log in and create two bookings, one with two days. Then on the Dashboard tab check:
- [ ] one row per day, soonest drop-off first, and the page is wide
- [ ] header click sorts; shift-click adds a second sort
- [ ] a Drop-off date filter "equals" a day matches stays with a time on that day
- [ ] the Client text filter and the Price number filter work together
- [ ] the search box narrows rows; typing "Nov" matches drop-off dates
- [ ] dragging a header reorders columns; the Columns menu hides and shows one
- [ ] Export CSV downloads `dd-pet-care-stays-<today>.csv`; it opens in Numbers/Excel with plain dates and numbers, only the filtered rows, in the on-screen column order
- [ ] cancelling a booking in History shows it as Cancelled on the Dashboard
- [ ] the browser's network tab shows the `Dashboard-*.js` chunk loads only when the tab first opens
- [ ] the page is usable at phone width (the grid scrolls sideways inside its box)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md ../docs/superpowers/specs/2026-11-03-dashboard-design.md
git commit -m "docs: document the dashboard grid and sync its spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push and hand over**

Push `feat/dashboard` and give the owner the PR link (`gh` isn't installed): `https://github.com/heidichen90/dog-sitting-booking/compare/main...feat/dashboard?expand=1`. The owner reviews and merges.
