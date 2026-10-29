import { useState, type SyntheticEvent } from 'react'
import {
  AppBar,
  Box,
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
import { getBookings, saveBooking, deleteBooking } from './storage.ts'
import type { Booking } from './types'

export default function App() {
  const [tab, setTab] = useState(0)
  const [confirmed, setConfirmed] = useState<Booking[] | null>(null)
  const [bookings, setBookings] = useState<Booking[]>(getBookings)

  function handleSubmit(bookings: Booking[]) {
    bookings.forEach((b) => saveBooking(b))
    setBookings(getBookings())
    setConfirmed(bookings)
  }

  function handleNewBooking() {
    setConfirmed(null)
  }

  function handleDelete(id: number) {
    deleteBooking(id)
    setBookings(getBookings())
  }

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

      <Box
        sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Container maxWidth="sm">
          <Tabs value={tab} onChange={(_: SyntheticEvent, v: number) => setTab(v)}>
            <Tab label="New Booking" />
            <Tab label={`History (${bookings.length})`} />
          </Tabs>
        </Container>
      </Box>

      <Box sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 112px)' }}>
        <Container maxWidth="sm" sx={{ py: 3 }}>
          {tab === 0 && (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
              {confirmed ? (
                <Confirmation bookings={confirmed} onNewBooking={handleNewBooking} />
              ) : (
                <BookingForm onSubmit={handleSubmit} />
              )}
            </Paper>
          )}

          {tab === 1 && (
            <BookingHistory bookings={bookings} onDelete={handleDelete} />
          )}
        </Container>
      </Box>
    </>
  )
}
