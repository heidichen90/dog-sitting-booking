import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import LoginPage from './LoginPage.tsx'
import { server } from '../test/server.ts'

const problemHeaders = { 'Content-Type': 'application/problem+json' }

function renderPage() {
  const onLoggedIn = vi.fn()
  render(<LoginPage onLoggedIn={onLoggedIn} />)
  return { user: userEvent.setup(), onLoggedIn }
}

const username = () => screen.getByLabelText('Username') as HTMLInputElement
const password = () => screen.getByLabelText('Password') as HTMLInputElement
const logIn = () => screen.getByRole('button', { name: 'Log in' })

describe('LoginPage', () => {
  it('sends the trimmed username and the password, then calls onLoggedIn', async () => {
    let sent: unknown
    server.use(
      http.post('/api/login', async ({ request }) => {
        sent = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user, onLoggedIn } = renderPage()

    await user.type(username(), ' ddpetcare ')
    await user.type(password(), 'secret')
    await user.click(logIn())

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled())
    expect(sent).toEqual({ username: 'ddpetcare', password: 'secret' })
  })

  it('shows the message for a wrong password and clears the password', async () => {
    server.use(
      http.post('/api/login', () =>
        HttpResponse.json(
          { status: 401, title: 'Invalid username or password' },
          { status: 401, headers: problemHeaders },
        ),
      ),
    )
    const { user, onLoggedIn } = renderPage()

    await user.type(username(), 'ddpetcare')
    await user.type(password(), 'wrong')
    await user.click(logIn())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Invalid username or password')
    expect(password().value).toBe('')
    expect(document.activeElement).toBe(password())
    expect(username().value).toBe('ddpetcare')
    expect(onLoggedIn).not.toHaveBeenCalled()
  })

  it('shows the throttle message', async () => {
    server.use(
      http.post('/api/login', () =>
        HttpResponse.json(
          { status: 429, title: 'Too many attempts, try again later' },
          { status: 429, headers: problemHeaders },
        ),
      ),
    )
    const { user } = renderPage()

    await user.type(username(), 'ddpetcare')
    await user.type(password(), 'secret')
    await user.click(logIn())

    expect(await screen.findByText('Too many attempts, try again later')).toBeTruthy()
    expect(password().value).toBe('')
  })

  it('disables Log in while the request is pending', async () => {
    let finishLogin = () => {}
    const loginHeld = new Promise<void>((resolve) => {
      finishLogin = resolve
    })
    server.use(
      http.post('/api/login', async () => {
        await loginHeld
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user, onLoggedIn } = renderPage()

    await user.type(username(), 'ddpetcare')
    await user.type(password(), 'secret')
    await user.click(logIn())

    await waitFor(() => expect((logIn() as HTMLButtonElement).disabled).toBe(true))
    finishLogin()
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled())
    expect((logIn() as HTMLButtonElement).disabled).toBe(false)
  })

  it('names the fields for password managers and focuses Username', () => {
    renderPage()

    expect(username().name).toBe('username')
    expect(password().name).toBe('password')
    expect(document.activeElement).toBe(username())
  })

  it('asks for both fields without calling the API', async () => {
    const { user, onLoggedIn } = renderPage()

    await user.type(username(), 'ddpetcare')
    await user.click(logIn())

    expect(screen.getByText('Enter your username and password')).toBeTruthy()
    expect(onLoggedIn).not.toHaveBeenCalled()
  })
})
