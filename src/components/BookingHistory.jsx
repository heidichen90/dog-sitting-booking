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

const SERVICE_COLOR = {
  Boarding: 'warning',
  'Day Care': 'success',
  Walking: 'info',
}

function fmt(iso, timeTbd = false) {
  if (timeTbd) return `${dayjs(iso).format('ddd, D MMM YYYY')} (time TBD)`
  return dayjs(iso).format('ddd, D MMM YYYY [at] h:mm A')
}

export default function BookingHistory({ bookings, onDelete }) {
  if (!bookings.length) {
    return (
      <Box textAlign="center" py={10} color="text.disabled">
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
              justifyContent="space-between"
              alignItems="flex-start"
            >
              <Box flex={1}>
                <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                  <Typography variant="subtitle1" fontWeight={700}>
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
              justifyContent="space-between"
              alignItems="center"
              mt={1.5}
              pt={1.5}
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
            >
              <Typography variant="h6" fontWeight={700} color="primary">
                £{parseFloat(b.price).toFixed(2)}
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
