import type { components } from './schema'

type Schemas = components['schemas']
type FieldError = Schemas['FieldError']
type ExistingClient = Schemas['ExistingClient']
type ProblemBody = Partial<Schemas['ValidationProblem'] & Schemas['ConflictProblem']>

export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string | null
  readonly fieldErrors: FieldError[]
  readonly existingClient: ExistingClient | null

  constructor(
    status: number,
    title: string,
    detail: string | null = null,
    fieldErrors: FieldError[] = [],
    existingClient: ExistingClient | null = null,
  ) {
    super(title)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.fieldErrors = fieldErrors
    this.existingClient = existingClient
  }
}

const CSRF_COOKIE = 'XSRF-TOKEN='

function csrfToken(): string | null {
  const cookie = document.cookie.split('; ').find((c) => c.startsWith(CSRF_COOKIE))
  if (!cookie) return null
  try {
    return decodeURIComponent(cookie.slice(CSRF_COOKIE.length))
  } catch {
    return null
  }
}

function headersFor(init: { method?: string; body?: string }): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body) headers['Content-Type'] = 'application/json'
  const token = init.method && init.method !== 'GET' ? csrfToken() : null
  if (token) headers['X-XSRF-TOKEN'] = token
  return headers
}

async function request<T>(path: string, init: { method?: string; body?: string } = {}): Promise<T> {
  let response: Response
  try {
    // An absolute URL, because Node's fetch (used by the tests) can't resolve a relative one.
    response = await fetch(new URL(path, window.location.origin), { ...init, headers: headersFor(init) })
  } catch {
    throw new ApiError(0, 'Could not reach the server')
  }
  if (!response.ok) throw await problemFrom(response)
  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError(response.status, 'Unexpected response from the server')
  }
}

async function problemFrom(response: Response): Promise<ApiError> {
  let body: ProblemBody = {}
  try {
    const parsed: unknown = await response.json()
    if (parsed && typeof parsed === 'object') body = parsed as ProblemBody
  } catch {
    // Not JSON, e.g. the dev proxy's own error page.
  }
  if (!body.title && [502, 503, 504].includes(response.status)) {
    return new ApiError(0, 'Could not reach the server')
  }
  return new ApiError(
    response.status,
    body.title || response.statusText || `Request failed (${response.status})`,
    body.detail ?? null,
    Array.isArray(body.errors) ? body.errors : [],
    body.existingClient ?? null,
  )
}

export function listClients(): Promise<Schemas['ClientResponse'][]> {
  return request<Schemas['ClientResponse'][]>('/api/clients')
}

export function listBookings(): Promise<Schemas['BookingResponse'][]> {
  return request<Schemas['BookingResponse'][]>('/api/bookings')
}

export function createBooking(body: Schemas['CreateBookingRequest']): Promise<Schemas['BookingResponse']> {
  return request<Schemas['BookingResponse']>('/api/bookings', { method: 'POST', body: JSON.stringify(body) })
}

export function cancelBooking(id: number): Promise<Schemas['BookingResponse']> {
  return request<Schemas['BookingResponse']>(`/api/bookings/${id}/cancel`, { method: 'POST' })
}

export function me(): Promise<Schemas['MeResponse']> {
  return request<Schemas['MeResponse']>('/api/me')
}

export function login(credentials: Schemas['LoginRequest']): Promise<void> {
  return request<void>('/api/login', { method: 'POST', body: JSON.stringify(credentials) })
}

export function logout(): Promise<void> {
  return request<void>('/api/logout', { method: 'POST' })
}

/** True for a 401, or for a 403 (a CSRF token gone stale, e.g. after logging out in another tab) when /api/me then says 401. */
export async function hasSessionEnded(err: unknown): Promise<boolean> {
  if (!(err instanceof ApiError)) return false
  if (err.status === 401) return true
  if (err.status !== 403) return false
  try {
    await me()
    return false
  } catch (meErr) {
    return meErr instanceof ApiError && meErr.status === 401
  }
}
