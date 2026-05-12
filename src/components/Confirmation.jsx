import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
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
import {
  generateWhatsAppMessage,
  generateWhatsAppLink,
  generateGCalLink,
  downloadICS,
} from '../utils'

export default function Confirmation({ booking, onNewBooking }) {
  const [copied, setCopied] = useState(false)
  const msg = generateWhatsAppMessage(booking)

  function handleCopy() {
    navigator.clipboard.writeText(msg).then(() => setCopied(true))
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" mb={3}>
        <CheckCircleIcon color="success" fontSize="large" />
        <Typography variant="h6" fontWeight={700}>
          Booking Confirmed!
        </Typography>
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
        <Button
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopy}
        >
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

      {/* Calendar */}
      <Typography
        variant="overline"
        color="text.secondary"
        fontWeight={700}
        display="block"
        mb={1}
      >
        Add to Calendar
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={4}>
        <Button
          variant="contained"
          startIcon={<CalendarMonthIcon />}
          component="a"
          href={generateGCalLink(booking)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ bgcolor: '#4285F4', '&:hover': { bgcolor: '#2b6fd6' } }}
        >
          Google Calendar
        </Button>
        <Button
          variant="contained"
          startIcon={<PhoneIphoneIcon />}
          onClick={() => downloadICS(booking)}
          sx={{ bgcolor: '#6e4fc8', '&:hover': { bgcolor: '#5a3ab0' } }}
        >
          Download .ics (iPhone)
        </Button>
      </Stack>

      <Typography
        variant="overline"
        color="text.secondary"
        fontWeight={700}
        display="block"
        mb={1}
      >
        Add another booking
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          variant="outlined"
          startIcon={<AddCircleOutlineIcon />}
          onClick={onNewBooking}
        >
          New Booking
        </Button>
      </Stack>

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
