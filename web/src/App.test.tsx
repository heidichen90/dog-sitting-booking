import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import App from './App.tsx'
import Providers from './test/Providers.tsx'
import { server } from './test/server.ts'
import { booking, cancelledBooking, clients } from './test/fixtures.ts'
import type { Booking } from './types'

const problemHeaders = { 'Content-Type': 'application/problem+json' }
const notLoggedIn = () =>
  HttpResponse.json({ status: 401, title: 'Not logged in' }, { status: 401, headers: problemHeaders })

function serveMe() {
  server.use(http.get('/api/me', () => HttpResponse.json({ username: 'ddpetcare' })))
}

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
    serveMe()
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
    serveMe()
    serveLists(() => [booking, cancelledBooking])
    render(<App />, { wrapper: Providers })

    expect(await screen.findByRole('tab', { name: 'History (1)' })).toBeTruthy()
  })

  it('shows the confirmation from the API response, then refreshes the lists', async () => {
    let loads = 0
    serveMe()
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
    serveMe()
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
    serveMe()
    serveLists(() => [booking])
    server.use(
      http.post('/api/bookings/:id/cancel', () =>
        HttpResponse.json(
          { status: 500, title: 'Internal error' },
          { status: 500, headers: problemHeaders },
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

  it('shows the login page and loads nothing when there is no session', async () => {
    server.use(http.get('/api/me', notLoggedIn))
    render(<App />, { wrapper: Providers })

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /History/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull()
    expect(screen.queryByText('Your session has ended. Please log in again.')).toBeNull()
  })

  it('logs in from the login page, then loads the app', async () => {
    server.use(
      http.get('/api/me', notLoggedIn),
      http.post('/api/login', () => new HttpResponse(null, { status: 204 })),
    )
    serveLists(() => [booking])
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.type(await screen.findByLabelText('Username'), 'ddpetcare')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('combobox', { name: 'Owner' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'History (1)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
  })

  it('shows a failed session check with Retry, then loads once it works', async () => {
    let failing = true
    server.use(
      http.get('/api/me', () => (failing ? HttpResponse.error() : HttpResponse.json({ username: 'ddpetcare' }))),
    )
    serveLists(() => [])
    render(<App />, { wrapper: Providers })

    expect(await screen.findByText('Could not reach the server')).toBeTruthy()
    failing = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('combobox', { name: 'Owner' })).toBeTruthy()
  })

  it('goes back to the login page and drops the data when a call gets 401 mid-use', async () => {
    serveMe()
    serveLists(() => [booking])
    server.use(http.post('/api/bookings/:id/cancel', notLoggedIn))
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.click(await screen.findByRole('tab', { name: 'History (1)' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking for Biscuit' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(screen.getByText('Your session has ended. Please log in again.')).toBeTruthy()
    await dialogGone()
    expect(screen.queryByRole('tab', { name: /History/ })).toBeNull()
    expect(screen.queryByText('🐕 Biscuit')).toBeNull()
    expect(screen.queryByText(/Couldn't cancel/)).toBeNull()
  })

  it('logs out and shows the login page', async () => {
    let loggedOut = false
    serveMe()
    serveLists(() => [booking])
    server.use(
      http.post('/api/logout', () => {
        loggedOut = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(loggedOut).toBe(true)
    expect(screen.queryByRole('tab', { name: /History/ })).toBeNull()
    expect(screen.queryByText('Your session has ended. Please log in again.')).toBeNull()
  })

  it('shows the login page even when logout fails', async () => {
    serveMe()
    serveLists(() => [booking])
    server.use(
      http.post('/api/logout', () =>
        HttpResponse.json({ status: 500, title: 'Internal error' }, { status: 500, headers: problemHeaders }),
      ),
    )
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /History/ })).toBeNull()
  })

  it('shows the login page with the session-ended message when the first list load gets 401', async () => {
    serveMe()
    server.use(
      http.get('/api/clients', notLoggedIn),
      http.get('/api/bookings', () => HttpResponse.json([booking])),
    )
    render(<App />, { wrapper: Providers })

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(screen.getByText('Your session has ended. Please log in again.')).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /History/ })).toBeNull()
  })

  it('checks the session when a cancel gets 403, and shows the login page if it has ended', async () => {
    let meCalls = 0
    server.use(
      http.get('/api/me', () => {
        meCalls += 1
        return meCalls === 1 ? HttpResponse.json({ username: 'ddpetcare' }) : notLoggedIn()
      }),
      http.post('/api/bookings/:id/cancel', () =>
        HttpResponse.json({ status: 403, title: 'Forbidden' }, { status: 403, headers: problemHeaders }),
      ),
    )
    serveLists(() => [booking])
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.click(await screen.findByRole('tab', { name: 'History (1)' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking for Biscuit' }))
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(screen.getByText('Your session has ended. Please log in again.')).toBeTruthy()
    expect(meCalls).toBe(2)
    await dialogGone()
    expect(screen.queryByText(/Couldn't cancel/)).toBeNull()
  })

  it('ignores a create that finishes after logout', async () => {
    let finishCreate = () => {}
    const createHeld = new Promise<void>((resolve) => {
      finishCreate = resolve
    })
    let bookingLoads = 0
    serveMe()
    server.use(
      http.get('/api/clients', () => HttpResponse.json(clients)),
      http.get('/api/bookings', () => {
        bookingLoads += 1
        return HttpResponse.json(bookingLoads === 1 ? [booking] : [])
      }),
      http.post('/api/bookings', async () => {
        await createHeld
        return HttpResponse.json(booking, { status: 201 })
      }),
      http.post('/api/logout', () => new HttpResponse(null, { status: 204 })),
      http.post('/api/login', () => new HttpResponse(null, { status: 204 })),
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
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByRole('button', { name: 'Log in' })
    finishCreate()

    await user.type(screen.getByLabelText('Username'), 'ddpetcare')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('tab', { name: 'History (0)' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Owner' })).toBeTruthy()
    expect(screen.queryByText('Booking Confirmed!')).toBeNull()
    expect(bookingLoads).toBe(2)
  })
})
