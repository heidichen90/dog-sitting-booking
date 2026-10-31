import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Confirmation from './Confirmation.tsx'
import { booking } from '../test/fixtures.ts'

describe('Confirmation', () => {
  it("shows the server's client, dog, day prices and total", () => {
    render(<Confirmation booking={booking} onNewBooking={vi.fn()} />)

    expect(screen.getByText('Booking Confirmed!')).toBeTruthy()
    expect(screen.getByText('🐕 Biscuit · 👤 Sarah Lee')).toBeTruthy()
    expect(screen.getByText('£95.00')).toBeTruthy()
    expect(screen.getByText('£35.00')).toBeTruthy()
    expect(screen.getByText('Total: £130.00')).toBeTruthy()
  })

  it('offers calendar buttons for each day', () => {
    render(<Confirmation booking={booking} onNewBooking={vi.fn()} />)

    expect(screen.getAllByRole('link', { name: 'Google Calendar' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Download .ics (iPhone)' })).toHaveLength(2)
  })
})
