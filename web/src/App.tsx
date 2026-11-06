import { lazy, Suspense, useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material'
import PetsIcon from '@mui/icons-material/Pets'
import BookingForm from './components/BookingForm.tsx'
import Confirmation from './components/Confirmation.tsx'
import BookingHistory from './components/BookingHistory.tsx'
import LoginPage from './components/LoginPage.tsx'
import { ApiError, cancelBooking, hasSessionEnded, listBookings, listClients, logout, me } from './api/client.ts'
import type { Booking, Client } from './types'

// Loaded on first open, so the grid library isn't downloaded with the rest of the site.
const Dashboard = lazy(() => import('./components/Dashboard.tsx'))

type Session = 'checking' | 'loggedOut' | 'loggedIn'

function problemTitle(err: unknown): string {
  return err instanceof ApiError ? err.title : 'Something went wrong'
}

function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401
}

export default function App() {
  const [session, setSession] = useState<Session>('checking')
  const [sessionEnded, setSessionEnded] = useState(false)
  // False from logout until the next login, so calls still in flight from the old session change nothing.
  const active = useRef(false)
  const [sessionCheck, setSessionCheck] = useState(0)
  const [tab, setTab] = useState(0)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Drops everything loaded for the owner, so nothing sensitive stays in memory behind the login page.
  const signOut = useCallback(() => {
    active.current = false
    setSession('loggedOut')
    setSessionEnded(false)
    setTab(0)
    setConfirmed(null)
    setClients([])
    setBookings([])
    setLoaded(false)
    setError(null)
    setCancelError(null)
  }, [])

  const sessionExpired = useCallback(() => {
    if (!active.current) return
    signOut()
    setSessionEnded(true)
  }, [signOut])

  useEffect(() => {
    let ignore = false
    me().then(
      () => {
        if (ignore) return
        active.current = true
        setSession('loggedIn')
      },
      (err: unknown) => {
        if (ignore) return
        if (isUnauthorized(err)) setSession('loggedOut')
        else setError(problemTitle(err))
      },
    )
    return () => {
      ignore = true
    }
  }, [sessionCheck])

  useEffect(() => {
    if (session !== 'loggedIn') return
    let ignore = false
    Promise.all([listClients(), listBookings()]).then(
      ([loadedClients, loadedBookings]) => {
        if (ignore) return
        setClients(loadedClients)
        setBookings(loadedBookings)
        setLoaded(true)
        setError(null)
      },
      (err: unknown) => {
        if (ignore) return
        if (isUnauthorized(err)) sessionExpired()
        else setError(problemTitle(err))
      },
    )
    return () => {
      ignore = true
    }
  }, [session, reloadKey, sessionExpired])

  function reload() {
    setReloadKey((k) => k + 1)
  }

  function handleCreated(booking: Booking) {
    if (!active.current) return
    setConfirmed(booking)
    reload()
  }

  function handleNewBooking() {
    setConfirmed(null)
  }

  async function handleCancel(id: number) {
    setCancelError(null)
    try {
      await cancelBooking(id)
      if (!active.current) return
      reload()
    } catch (err) {
      const ended = await hasSessionEnded(err)
      if (!active.current) return
      if (ended) sessionExpired()
      else setCancelError(`Couldn't cancel the booking: ${problemTitle(err)}`)
    }
  }

  function handleRetry() {
    setError(null)
    if (session === 'checking') setSessionCheck((k) => k + 1)
    else reload()
  }

  function handleLoggedIn() {
    active.current = true
    setSessionEnded(false)
    setSession('loggedIn')
  }

  async function handleLogout() {
    try {
      await logout()
    } catch {
      // The session may already be gone; show the login page either way.
    }
    signOut()
  }

  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <PetsIcon sx={{ mr: 1.5 }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              DD PET CARE BOOKING
            </Typography>
          </Box>
          {session === 'loggedIn' && (
            <Button color="inherit" onClick={handleLogout}>
              Log out
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {session === 'loggedIn' && (
        <Box sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Container maxWidth="sm">
            <Tabs value={tab} onChange={(_: SyntheticEvent, v: number) => setTab(v)}>
              <Tab label="New Booking" />
              <Tab label={`History (${confirmedCount})`} />
              <Tab label="Dashboard" />
            </Tabs>
          </Container>
        </Box>
      )}

      <Box sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 112px)' }}>
        <Container maxWidth={tab === 2 ? 'xl' : 'sm'} sx={{ py: 3 }}>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <Button color="inherit" size="small" onClick={handleRetry}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          )}

          {cancelError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setCancelError(null)}>
              {cancelError}
            </Alert>
          )}

          {session === 'loggedOut' && sessionEnded && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Your session has ended. Please log in again.
            </Alert>
          )}

          {session === 'loggedOut' && <LoginPage onLoggedIn={handleLoggedIn} />}

          {session !== 'loggedOut' && !loaded && !error && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress aria-label="Loading" />
            </Box>
          )}

          {loaded && tab === 0 && (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
              {confirmed ? (
                <Confirmation booking={confirmed} onNewBooking={handleNewBooking} />
              ) : (
                <BookingForm clients={clients} onCreated={handleCreated} onUnauthorized={sessionExpired} />
              )}
            </Paper>
          )}

          {loaded && tab === 1 && <BookingHistory bookings={bookings} onCancel={handleCancel} />}

          {loaded && tab === 2 && (
            <Suspense fallback={<CircularProgress aria-label="Loading" />}>
              <Dashboard bookings={bookings} />
            </Suspense>
          )}
        </Container>
      </Box>
    </>
  )
}
