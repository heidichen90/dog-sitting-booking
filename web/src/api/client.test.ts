import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server.ts'
import { booking, clients } from '../test/fixtures.ts'
import { ApiError, cancelBooking, createBooking, listBookings, listClients, login, logout, me } from './client.ts'
import type { components } from './schema'

const request: components['schemas']['CreateBookingRequest'] = {
  client: { id: 1 },
  dog: { id: 11 },
  notes: null,
  stays: [
    {
      dropOffDate: '2030-11-02',
      dropOffTime: null,
      pickUpDate: '2030-11-04',
      pickUpTime: null,
      unitRate: 40,
      pickupDropoffFee: 15,
    },
  ],
}

const problemHeaders = { 'Content-Type': 'application/problem+json' }

async function failure(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call
  } catch (err) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error('Expected the call to fail')
}

describe('api client', () => {
  it('parses the client list', async () => {
    server.use(http.get('/api/clients', () => HttpResponse.json(clients)))

    expect(await listClients()).toEqual(clients)
  })

  it('parses a booking', async () => {
    server.use(http.get('/api/bookings', () => HttpResponse.json([booking])))

    expect(await listBookings()).toEqual([booking])
  })

  it('posts the request as JSON and returns the created booking', async () => {
    let sent: unknown
    let contentType: string | null = null
    server.use(
      http.post('/api/bookings', async ({ request: req }) => {
        sent = await req.json()
        contentType = req.headers.get('Content-Type')
        return HttpResponse.json(booking, { status: 201 })
      }),
    )

    expect(await createBooking(request)).toEqual(booking)
    expect(sent).toEqual(request)
    expect(contentType).toBe('application/json')
  })

  it('cancels by id', async () => {
    let cancelledId: string | undefined
    server.use(
      http.post('/api/bookings/:id/cancel', ({ params }) => {
        cancelledId = String(params.id)
        return HttpResponse.json({ ...booking, status: 'cancelled' })
      }),
    )

    expect((await cancelBooking(12)).status).toBe('cancelled')
    expect(cancelledId).toBe('12')
  })

  it('turns a 400 into fieldErrors', async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          {
            status: 400,
            title: 'Invalid request',
            errors: [{ field: 'stays[1].pickUpDate', message: 'must not be before dropOffDate' }],
          },
          { status: 400, headers: problemHeaders },
        ),
      ),
    )

    const err = await failure(createBooking(request))
    expect(err.status).toBe(400)
    expect(err.title).toBe('Invalid request')
    expect(err.fieldErrors).toEqual([{ field: 'stays[1].pickUpDate', message: 'must not be before dropOffDate' }])
    expect(err.existingClient).toBeNull()
  })

  it('turns a 409 into existingClient', async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          {
            status: 409,
            title: 'Phone already on file',
            detail: 'This phone number already belongs to Sarah Lee. Book for that client instead.',
            existingClient: { id: 1, name: 'Sarah Lee' },
          },
          { status: 409, headers: problemHeaders },
        ),
      ),
    )

    const err = await failure(createBooking(request))
    expect(err.status).toBe(409)
    expect(err.existingClient).toEqual({ id: 1, name: 'Sarah Lee' })
    expect(err.fieldErrors).toEqual([])
  })

  it('keeps the title and detail of other problems', async () => {
    server.use(
      http.post('/api/bookings/:id/cancel', () =>
        HttpResponse.json(
          { status: 404, title: 'Not found', detail: 'Booking 99 not found' },
          { status: 404, headers: problemHeaders },
        ),
      ),
    )

    const err = await failure(cancelBooking(99))
    expect(err.status).toBe(404)
    expect(err.title).toBe('Not found')
    expect(err.detail).toBe('Booking 99 not found')
  })

  it('turns a network failure into status 0', async () => {
    server.use(http.get('/api/bookings', () => HttpResponse.error()))

    const err = await failure(listBookings())
    expect(err.status).toBe(0)
    expect(err.title).toBe('Could not reach the server')
  })

  it('turns a 200 with a non-JSON body into an ApiError', async () => {
    server.use(http.get('/api/bookings', () => new HttpResponse('<html></html>', { headers: { 'Content-Type': 'text/html' } })))

    const err = await failure(listBookings())
    expect(err.status).toBe(200)
    expect(err.title).toBe('Unexpected response from the server')
  })

  it('turns an error with a null JSON body into an ApiError with the status', async () => {
    server.use(http.get('/api/bookings', () => HttpResponse.json(null, { status: 500 })))

    const err = await failure(listBookings())
    expect(err.status).toBe(500)
    expect(err.fieldErrors).toEqual([])
  })

  it('treats a 502 with an HTML body as the server being unreachable', async () => {
    server.use(http.get('/api/bookings', () => new HttpResponse('<html>', { status: 502, headers: { 'Content-Type': 'text/html' } })))

    const err = await failure(listBookings())
    expect(err.status).toBe(0)
    expect(err.title).toBe('Could not reach the server')
  })

  it('treats an empty 502 as the server being unreachable', async () => {
    server.use(http.get('/api/bookings', () => new HttpResponse(null, { status: 502, headers: { 'Content-Type': 'text/plain' } })))

    const err = await failure(listBookings())
    expect(err.status).toBe(0)
    expect(err.title).toBe('Could not reach the server')
  })

  it('keeps a 503 problem body that has a title', async () => {
    server.use(
      http.get('/api/bookings', () =>
        HttpResponse.json(
          { status: 503, title: 'Maintenance', detail: 'Back soon' },
          { status: 503, headers: problemHeaders },
        ),
      ),
    )

    const err = await failure(listBookings())
    expect(err.status).toBe(503)
    expect(err.title).toBe('Maintenance')
  })
})

describe('login, session and CSRF', () => {
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    document.cookie = 'XSRF-TOKEN2=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  function captureLogoutHeader(): { value: string | null } {
    const header: { value: string | null } = { value: 'unset' }
    server.use(
      http.post('/api/logout', ({ request }) => {
        header.value = request.headers.get('X-XSRF-TOKEN')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    return header
  }

  it('ignores a lookalike cookie and sends the real token', async () => {
    document.cookie = 'XSRF-TOKEN2=bad; path=/'
    document.cookie = 'XSRF-TOKEN=real; path=/'
    const header = captureLogoutHeader()

    await logout()

    expect(header.value).toBe('real')
  })

  it('URL-decodes the token', async () => {
    document.cookie = 'XSRF-TOKEN=a%2Bb; path=/'
    const header = captureLogoutHeader()

    await logout()

    expect(header.value).toBe('a+b')
  })

  it('sends no token, and still makes the call, when the cookie cannot be decoded', async () => {
    document.cookie = 'XSRF-TOKEN=%E0%A4%A; path=/'
    const header = captureLogoutHeader()

    await logout()

    expect(header.value).toBeNull()
  })

  it('copies the XSRF-TOKEN cookie into X-XSRF-TOKEN on a POST, but not on a GET', async () => {
    document.cookie = 'XSRF-TOKEN=token-123; path=/'
    let postHeader: string | null = 'unset'
    let getHeader: string | null = 'unset'
    server.use(
      http.post('/api/bookings/:id/cancel', ({ request }) => {
        postHeader = request.headers.get('X-XSRF-TOKEN')
        return HttpResponse.json(booking)
      }),
      http.get('/api/bookings', ({ request }) => {
        getHeader = request.headers.get('X-XSRF-TOKEN')
        return HttpResponse.json([])
      }),
    )

    await cancelBooking(12)
    await listBookings()

    expect(postHeader).toBe('token-123')
    expect(getHeader).toBeNull()
  })

  it('sends no X-XSRF-TOKEN when there is no cookie', async () => {
    let header: string | null = 'unset'
    server.use(
      http.post('/api/logout', ({ request }) => {
        header = request.headers.get('X-XSRF-TOKEN')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await logout()

    expect(header).toBeNull()
  })

  it('returns the logged-in username from /api/me', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json({ username: 'ddpetcare' })))

    expect(await me()).toEqual({ username: 'ddpetcare' })
  })

  it('posts the credentials and resolves on 204', async () => {
    let sent: unknown
    server.use(
      http.post('/api/login', async ({ request }) => {
        sent = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(login({ username: 'ddpetcare', password: 'secret' })).resolves.toBeUndefined()
    expect(sent).toEqual({ username: 'ddpetcare', password: 'secret' })
  })

  it('turns a failed login into an ApiError with the title', async () => {
    server.use(
      http.post('/api/login', () =>
        HttpResponse.json(
          { status: 401, title: 'Invalid username or password' },
          { status: 401, headers: problemHeaders },
        ),
      ),
    )

    const err = await failure(login({ username: 'ddpetcare', password: 'wrong' }))
    expect(err.status).toBe(401)
    expect(err.title).toBe('Invalid username or password')
  })
})
