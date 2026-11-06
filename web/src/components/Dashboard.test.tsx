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
