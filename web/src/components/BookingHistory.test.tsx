import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingHistory from './BookingHistory.tsx'
import { booking, cancelledBooking } from '../test/fixtures.ts'

describe('BookingHistory', () => {
  it('shows one card per booking with its days', () => {
    render(<BookingHistory bookings={[booking, cancelledBooking]} onCancel={vi.fn()} />)

    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    const first = within(cards[0])
    expect(first.getByText('🐕 Biscuit')).toBeTruthy()
    expect(first.getByText('👤 Sarah Lee')).toBeTruthy()
    expect(first.getByText(/Sat, 2 Nov 2030 at 9:00 AM → Mon, 4 Nov 2030 \(time TBD\)/)).toBeTruthy()
    expect(first.getByText('£95.00')).toBeTruthy()
    expect(first.getByText('£35.00')).toBeTruthy()
    expect(first.getByText('£130.00')).toBeTruthy()
  })

  it('greys out a cancelled booking, with a Cancelled chip and no Cancel button', () => {
    render(<BookingHistory bookings={[booking, cancelledBooking]} onCancel={vi.fn()} />)

    const [confirmedCard, cancelledCard] = screen.getAllByRole('article')
    expect(within(cancelledCard).getByText('Cancelled')).toBeTruthy()
    expect(within(cancelledCard).queryByRole('button', { name: /^Cancel booking/ })).toBeNull()
    expect(getComputedStyle(cancelledCard).opacity).toBe('0.6')
    expect(within(confirmedCard).getByRole('button', { name: 'Cancel booking for Biscuit' })).toBeTruthy()
    expect(within(confirmedCard).queryByText('Cancelled')).toBeNull()
  })

  it('asks in a dialog before cancelling and does nothing on Keep booking', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<BookingHistory bookings={[booking]} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel booking for Biscuit' }))

    const dialog = screen.getByRole('dialog', { name: 'Cancel this booking?' })
    expect(within(dialog).getByText("Biscuit's booking for Sarah Lee will be cancelled.")).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Keep booking' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel with the booking id on Cancel booking', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<BookingHistory bookings={[booking]} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel booking for Biscuit' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(onCancel).toHaveBeenCalledWith(12)
  })
})
