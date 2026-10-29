import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/Delete'
import PetsIcon from '@mui/icons-material/Pets'
import dayjs from 'dayjs'
import { fmt } from '../utils.ts'
import type { Booking } from '../types'

const SERVICE_COLOR: Record<string, 'warning' | 'success' | 'info'> = {
  Boarding: 'warning',
  'Day Care': 'success',
  Walking: 'info',
}

interface BookingHistoryProps {
  bookings: Booking[]
  onDelete: (id: number) => void
}

export default function BookingHistory({ bookings, onDelete }: BookingHistoryProps) {
  if (!bookings.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
        <PetsIcon sx={{ fontSize: 64, mb: 1 }} />
        <Typography variant="h6">No bookings yet</Typography>
        <Typography variant="body2">
          Create your first booking to get started.
        </Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={2}>
      {bookings.map((b) => (
        <Card
          key={b.id}
          variant="outlined"
          sx={{ borderLeft: '4px solid', borderLeftColor: 'primary.main' }}
        >
          <CardContent>
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    🐕 {b.dogName}
                  </Typography>
                  <Chip
                    label={b.service}
                    size="small"
                    color={SERVICE_COLOR[b.service] ?? 'default'}
                  />
                </Stack>

                <Typography variant="body2" color="text.secondary">
                  👤 {b.ownerName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  📅 Drop-off: {fmt(b.dropOff, b.timesTbd)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  📅 Pick-up: {fmt(b.pickUp, b.timesTbd)}
                </Typography>
                {b.pickupDropoff && (
                  <Typography variant="body2" color="text.secondary">
                    🚗 Pickup &amp; drop-off service included
                  </Typography>
                )}
                {b.notes && (
                  <Typography variant="body2" color="text.secondary">
                    📝 {b.notes}
                  </Typography>
                )}
              </Box>

              <Tooltip title="Delete booking">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => {
                    if (window.confirm('Delete this booking?')) onDelete(b.id)
                  }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Tooltip>
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
                £{b.price.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Booked {dayjs(b.createdAt).format('D MMM YYYY')}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  )
}
