import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import App from './App.tsx'
import Providers from './test/Providers.tsx'
import { server } from './test/server.ts'
import { booking, cancelledBooking, clients } from './test/fixtures.ts'
import type { Booking } from './types'

function serveLists(bookings: () => Booking[]) {
  server.use(
    http.get('/api/clients', () => HttpResponse.json(clients)),
    http.get('/api/bookings', () => HttpResponse.json(bookings())),
  )
}

// MUI keeps the rest of the page aria-hidden until the dialog's exit transition ends.
const dialogGone = () => waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull())

describe('App', () => {
  it('shows loading, then the problem title with Retry, then the form once Retry works', async () => {
    let failing = true
    server.use(
      http.get('/api/clients', () =>
        failing
          ? HttpResponse.json({ status: 500, title: 'Internal error' }, { status: 500 })
          : HttpResponse.json(clients),
      ),
      http.get('/api/bookings', () => HttpResponse.json([])),
    )
    render(<App />, { wrapper: Providers })

    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(await screen.findByText('Internal error')).toBeTruthy()

    failing = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('combobox', { name: 'Owner' })).toBeTruthy()
  })

  it('counts only confirmed bookings in the History tab', async () => {
    serveLists(() => [booking, cancelledBooking])
    render(<App />, { wrapper: Providers })

    expect(await screen.findByRole('tab', { name: 'History (1)' })).toBeTruthy()
  })

  it('shows the confirmation from the API response, then refreshes the lists', async () => {
    let loads = 0
    server.use(
      http.get('/api/clients', () => HttpResponse.json(clients)),
      http.get('/api/bookings', () => {
        loads += 1
        return HttpResponse.json(loads > 1 ? [booking] : [])
      }),
      http.post('/api/bookings', () => HttpResponse.json(booking, { status: 201 })),
    )
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.type(await screen.findByRole('combobox', { name: 'Owner' }), 'sar')
    await user.click(screen.getByRole('option', { name: /Sarah Lee/ }))
    await user.type(screen.getByRole('combobox', { name: 'Dog' }), 'bis')
    await user.click(screen.getByRole('option', { name: 'Biscuit' }))
    fireEvent.change(screen.getAllByLabelText('Drop-off Date', { selector: 'input' })[0], {
      target: { value: '02/11/2030' },
    })
    fireEvent.change(screen.getAllByLabelText('Pick-up Date', { selector: 'input' })[0], {
      target: { value: '04/11/2030' },
    })
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    expect(await screen.findByText('Booking Confirmed!')).toBeTruthy()
    expect(await screen.findByRole('tab', { name: 'History (1)' })).toBeTruthy()
  })

  it('cancels a booking after the confirm dialog, then shows it as cancelled', async () => {
    let current: Booking = booking
    const cancelledIds: number[] = []
    serveLists(() => [current])
    server.use(
      http.post('/api/bookings/:id/cancel', ({ params }) => {
        cancelledIds.push(Number(params.id))
        current = {
          ...booking,
          status: 'cancelled',
          total: 0,
          stays: booking.stays.map((stay) => ({ ...stay, status: 'cancelled' as const })),
        }
        return HttpResponse.json(current)
      }),
    )
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.click(await screen.findByRole('tab', { name: 'History (1)' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking for Biscuit' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(await screen.findByText('Cancelled')).toBeTruthy()
    expect(cancelledIds).toEqual([12])
    await dialogGone()
    expect(screen.getByRole('tab', { name: 'History (0)' })).toBeTruthy()
  })

  it('shows a failed cancel on its own, without Retry, and keeps the lists', async () => {
    serveLists(() => [booking])
    server.use(
      http.post('/api/bookings/:id/cancel', () =>
        HttpResponse.json(
          { status: 500, title: 'Internal error' },
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.click(await screen.findByRole('tab', { name: 'History (1)' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking for Biscuit' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(await screen.findByText("Couldn't cancel the booking: Internal error")).toBeTruthy()
    await dialogGone()
    expect(screen.getByRole('button', { name: 'Cancel booking for Biscuit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'History (1)' })).toBeTruthy()
  })
})
