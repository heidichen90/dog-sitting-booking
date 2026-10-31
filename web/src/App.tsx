import { useEffect, useState, type SyntheticEvent } from 'react'
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
import { ApiError, cancelBooking, listBookings, listClients } from './api/client.ts'
import type { Booking, Client } from './types'

function problemTitle(err: unknown): string {
  return err instanceof ApiError ? err.title : 'Something went wrong'
}

export default function App() {
  const [tab, setTab] = useState(0)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
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
        if (!ignore) setError(problemTitle(err))
      },
    )
    return () => {
      ignore = true
    }
  }, [reloadKey])

  function reload() {
    setReloadKey((k) => k + 1)
  }

  function handleCreated(booking: Booking) {
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
      reload()
    } catch (err) {
      setCancelError(`Couldn't cancel the booking: ${problemTitle(err)}`)
    }
  }

  function handleRetry() {
    setError(null)
    reload()
  }

  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <PetsIcon sx={{ mr: 1.5 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              DD PET CARE BOOKING
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="sm">
          <Tabs value={tab} onChange={(_: SyntheticEvent, v: number) => setTab(v)}>
            <Tab label="New Booking" />
            <Tab label={`History (${confirmedCount})`} />
          </Tabs>
        </Container>
      </Box>

      <Box sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 112px)' }}>
        <Container maxWidth="sm" sx={{ py: 3 }}>
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

          {!loaded && !error && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress aria-label="Loading" />
            </Box>
          )}

          {loaded && tab === 0 && (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
              {confirmed ? (
                <Confirmation booking={confirmed} onNewBooking={handleNewBooking} />
              ) : (
                <BookingForm clients={clients} onCreated={handleCreated} />
              )}
            </Paper>
          )}

          {loaded && tab === 1 && <BookingHistory bookings={bookings} onCancel={handleCancel} />}
        </Container>
      </Box>
    </>
  )
}
