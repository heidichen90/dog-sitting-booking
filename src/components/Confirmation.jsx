import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined'
import dayjs from 'dayjs'
import {
  generateWhatsAppMessageMulti,
  generateWhatsAppLink,
  generateGCalLink,
  downloadICS,
} from '../utils'

const SERVICE_COLOR = { Boarding: 'warning', 'Day Care': 'success' }

function fmt(iso, timeTbd = false) {
  if (timeTbd) return `${dayjs(iso).format('ddd, D MMM YYYY')} (time TBD)`
  return dayjs(iso).format('ddd, D MMM YYYY [at] h:mm A')
}

export default function Confirmation({ bookings, onNewBooking }) {
  const [copied, setCopied] = useState(false)
  const msg = generateWhatsAppMessageMulti(bookings)
  const total = bookings.reduce((sum, b) => sum + parseFloat(b.price), 0)

  function handleCopy() {
    navigator.clipboard.writeText(msg).then(() => setCopied(true))
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" mb={3}>
        <CheckCircleIcon color="success" fontSize="large" />
        <Typography variant="h6" fontWeight={700}>
          {bookings.length === 1 ? 'Booking Confirmed!' : `${bookings.length} Bookings Confirmed!`}
        </Typography>
      </Stack>

      {/* Booking summary */}
      <Typography
        variant="overline"
        color="text.secondary"
        fontWeight={700}
        display="block"
        mb={1}
      >
        Summary
      </Typography>
      <Stack spacing={1} mb={3}>
        {bookings.map((b, i) => (
          <Stack
            key={b.id}
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              {bookings.length > 1 && (
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 20 }}>
                  {i + 1}.
                </Typography>
              )}
              <Box>
                <Typography variant="body2">
                  {fmt(b.dropOff, b.timesTbd)}
                  {b.service === 'Boarding' && ` → ${fmt(b.pickUp, b.timesTbd)}`}
                </Typography>
              </Box>
              <Chip label={b.service} size="small" color={SERVICE_COLOR[b.service] ?? 'default'} />
            </Stack>
            <Typography variant="body2" fontWeight={700}>
              £{parseFloat(b.price).toFixed(2)}
            </Typography>
          </Stack>
        ))}
        {bookings.length > 1 && (
          <Stack direction="row" justifyContent="flex-end">
            <Typography variant="subtitle1" fontWeight={700} color="primary">
              Total: £{total.toFixed(2)}
            </Typography>
          </Stack>
        )}
      </Stack>

      {/* WhatsApp message */}
      <Typography
        variant="overline"
        color="text.secondary"
        fontWeight={700}
        display="block"
        mb={1}
      >
        WhatsApp Confirmation Message
      </Typography>
      <Paper
        variant="outlined"
        sx={{ p: 2, mb: 1.5, bgcolor: '#f0faf4', borderColor: '#a5d6b7' }}
      >
        <Typography
          component="pre"
          sx={{
            fontFamily: 'inherit',
            fontSize: '0.875rem',
            lineHeight: 1.75,
            whiteSpace: 'pre-wrap',
            color: '#1b5e20',
            m: 0,
          }}
        >
          {msg}
        </Typography>
      </Paper>
      <Stack direction="row" spacing={1.5} mb={4}>
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopy}>
          Copy
        </Button>
        <Button
          variant="contained"
          startIcon={<WhatsAppIcon />}
          component="a"
          href={generateWhatsAppLink(msg)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' } }}
        >
          Open WhatsApp
        </Button>
      </Stack>

      {/* Calendar — one set of buttons per booking */}
      <Typography
        variant="overline"
        color="text.secondary"
        fontWeight={700}
        display="block"
        mb={1}
      >
        Add to Calendar
      </Typography>
      <Stack spacing={1.5} mb={4}>
        {bookings.map((b, i) => (
          <Box key={b.id}>
            {bookings.length > 1 && (
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                Booking {i + 1} — {fmt(b.dropOff, b.timesTbd)}
              </Typography>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                startIcon={<CalendarMonthIcon />}
                component="a"
                href={generateGCalLink(b)}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                sx={{ bgcolor: '#4285F4', '&:hover': { bgcolor: '#2b6fd6' } }}
              >
                Google Calendar
              </Button>
              <Button
                variant="contained"
                startIcon={<PhoneIphoneIcon />}
                onClick={() => downloadICS(b)}
                size="small"
                sx={{ bgcolor: '#6e4fc8', '&:hover': { bgcolor: '#5a3ab0' } }}
              >
                Download .ics (iPhone)
              </Button>
            </Stack>
            {i < bookings.length - 1 && <Divider sx={{ mt: 1.5 }} />}
          </Box>
        ))}
      </Stack>

      <Typography
        variant="overline"
        color="text.secondary"
        fontWeight={700}
        display="block"
        mb={1}
      >
        New Booking
      </Typography>
      <Button variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={onNewBooking}>
        New Booking
      </Button>

      <Snackbar
        open={copied}
        autoHideDuration={2500}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setCopied(false)}>
          Copied to clipboard!
        </Alert>
      </Snackbar>
    </Box>
  )
}
