import { useState } from 'react'
import { Alert, Box, Button, Chip, Divider, Paper, Snackbar, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined'
import {
  SERVICE_COLOR,
  SERVICE_LABEL,
  downloadICS,
  fmt,
  generateGCalLink,
  generateWhatsAppLink,
  generateWhatsAppMessage,
} from '../utils.ts'
import type { Booking } from '../types'

interface ConfirmationProps {
  booking: Booking
  onNewBooking: () => void
}

export default function Confirmation({ booking, onNewBooking }: ConfirmationProps) {
  const [copied, setCopied] = useState(false)
  const msg = generateWhatsAppMessage(booking)
  const { stays } = booking
  const several = stays.length > 1

  function handleCopy() {
    navigator.clipboard.writeText(msg).then(() => setCopied(true))
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
        <CheckCircleIcon color="success" fontSize="large" />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Booking Confirmed!
        </Typography>
      </Stack>

      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
        Summary
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 700, mb: 1 }}>
        🐕 {booking.dog.name} · 👤 {booking.client.name}
      </Typography>
      <Stack spacing={1} sx={{ mb: 3 }}>
        {stays.map((stay, i) => (
          <Stack
            key={stay.id}
            direction="row"
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
              py: 0.75,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {several && (
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 20 }}>
                  {i + 1}.
                </Typography>
              )}
              <Box>
                <Typography variant="body2">
                  {fmt(stay.dropOffDate, stay.dropOffTime)}
                  {` → ${fmt(stay.pickUpDate, stay.pickUpTime)}`}
                </Typography>
              </Box>
              <Chip label={SERVICE_LABEL[stay.service]} size="small" color={SERVICE_COLOR[stay.service]} />
            </Stack>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              £{stay.price.toFixed(2)}
            </Typography>
          </Stack>
        ))}
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 700 }}>
            Total: £{booking.total.toFixed(2)}
          </Typography>
        </Stack>
      </Stack>

      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
        WhatsApp Confirmation Message
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 1.5, bgcolor: '#f0faf4', borderColor: '#a5d6b7' }}>
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
      <Stack direction="row" spacing={1.5} sx={{ mb: 4 }}>
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

      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
        Add to Calendar
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 4 }}>
        {stays.map((stay, i) => (
          <Box key={stay.id}>
            {several && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Day {i + 1} — {fmt(stay.dropOffDate, stay.dropOffTime)}
              </Typography>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                startIcon={<CalendarMonthIcon />}
                component="a"
                href={generateGCalLink(booking, stay)}
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
                onClick={() => downloadICS(booking, stay)}
                size="small"
                sx={{ bgcolor: '#6e4fc8', '&:hover': { bgcolor: '#5a3ab0' } }}
              >
                Download .ics (iPhone)
              </Button>
            </Stack>
            {i < stays.length - 1 && <Divider sx={{ mt: 1.5 }} />}
          </Box>
        ))}
      </Stack>

      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
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
