import { useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import PetsIcon from '@mui/icons-material/Pets'
import dayjs from 'dayjs'
import { SERVICE_COLOR, SERVICE_LABEL, fmt } from '../utils.ts'
import type { Booking } from '../types'

interface BookingHistoryProps {
  bookings: Booking[]
  onCancel: (id: number) => void
}

export default function BookingHistory({ bookings, onCancel }: BookingHistoryProps) {
  const [pending, setPending] = useState<Booking | null>(null)

  if (!bookings.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
        <PetsIcon sx={{ fontSize: 64, mb: 1 }} />
        <Typography variant="h6">No bookings yet</Typography>
        <Typography variant="body2">Create your first booking to get started.</Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={2}>
      {bookings.map((b) => {
        const cancelled = b.status === 'cancelled'
        return (
          <Card
            key={b.id}
            component="article"
            aria-label={`Booking for ${b.dog.name}`}
            variant="outlined"
            sx={{
              borderLeft: '4px solid',
              borderLeftColor: cancelled ? 'text.disabled' : 'primary.main',
              opacity: cancelled ? 0.6 : 1,
            }}
          >
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      🐕 {b.dog.name}
                    </Typography>
                    {cancelled && <Chip label="Cancelled" size="small" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    👤 {b.client.name}
                  </Typography>

                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    {b.stays.map((stay) => (
                      <Box key={stay.id}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Chip
                            label={SERVICE_LABEL[stay.service]}
                            size="small"
                            color={SERVICE_COLOR[stay.service]}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            £{stay.price.toFixed(2)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          📅 {fmt(stay.dropOffDate, stay.dropOffTime)} → {fmt(stay.pickUpDate, stay.pickUpTime)}
                        </Typography>
                        {stay.pickupDropoffFee > 0 && (
                          <Typography variant="body2" color="text.secondary">
                            🚗 Pickup &amp; drop-off service included
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>

                  {b.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      📝 {b.notes}
                    </Typography>
                  )}
                </Box>

                {!cancelled && (
                  <Button
                    size="small"
                    color="error"
                    aria-label={`Cancel booking for ${b.dog.name}`}
                    onClick={() => setPending(b)}
                  >
                    Cancel
                  </Button>
                )}
              </Stack>

              <Stack
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 1.5,
                  pt: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
                  £{b.total.toFixed(2)}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Booked {dayjs(b.createdAt).format('D MMM YYYY')}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        )
      })}

      <Dialog open={pending !== null} onClose={() => setPending(null)} aria-labelledby="cancel-booking-title">
        <DialogTitle id="cancel-booking-title">Cancel this booking?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pending && `${pending.dog.name}'s booking for ${pending.client.name} will be cancelled.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Keep booking</Button>
          <Button
            color="error"
            onClick={() => {
              if (pending) onCancel(pending.id)
              setPending(null)
            }}
          >
            Cancel booking
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
