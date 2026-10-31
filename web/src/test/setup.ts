import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server.ts'

const unhandled: string[] = []

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      unhandled.push(`${request.method} ${request.url}`)
      print.error()
    },
  }),
)

afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.restoreAllMocks()
  if (unhandled.length > 0) {
    const list = unhandled.splice(0).join(', ')
    throw new Error(`Unhandled requests: ${list}`)
  }
})

afterAll(() => server.close())
