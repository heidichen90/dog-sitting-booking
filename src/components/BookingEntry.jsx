import { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import DeleteOutlineIcon from '@mui/icons-material/Delete'
import dayjs from 'dayjs'

const SERVICE_COLOR = { Boarding: 'warning', 'Day Care': 'success' }

function deriveService(dropOff, pickUp) {
  if (!dropOff || !pickUp || !dayjs(dropOff).isValid() || !dayjs(pickUp).isValid()) return ''
  const nights = dayjs(pickUp).startOf('day').diff(dayjs(dropOff).startOf('day'), 'day')
  return nights === 0 ? 'Day Care' : 'Boarding'
}

function calcPrice(dropOff, pickUp, pickupDropoff) {
  if (!dropOff || !pickUp || !dayjs(dropOff).isValid() || !dayjs(pickUp).isValid()) return null
  const nights = dayjs(pickUp).startOf('day').diff(dayjs(dropOff).startOf('day'), 'day')
  const base = nights === 0 ? 35 : nights * 40
  return base + (pickupDropoff ? 15 : 0)
}

function priceBreakdown(dropOff, pickUp, pickupDropoff) {
  if (!dropOff || !pickUp || !dayjs(dropOff).isValid() || !dayjs(pickUp).isValid()) return ''
  const nights = dayjs(pickUp).startOf('day').diff(dayjs(dropOff).startOf('day'), 'day')
  const parts = []
  if (nights === 0) parts.push('Day care £35')
  else parts.push(`${nights} night${nights > 1 ? 's' : ''} × £40`)
  if (pickupDropoff) parts.push('pickup/drop-off +£15')
  return parts.join(' · ')
}

export { deriveService, calcPrice }

export default function BookingEntry({ entry, onChange, onRemove, index, errors = {} }) {
  const [notesOpen, setNotesOpen] = useState(false)

  const set = (field) => (val) => onChange({ ...entry, [field]: val })
  const setCheck = (field) => (e) => onChange({ ...entry, [field]: e.target.checked })
  const setNotes = (e) => onChange({ ...entry, notes: e.target.value })

  const price = calcPrice(entry.dropOff, entry.pickUp, entry.pickupDropoff)
  const service = deriveService(entry.dropOff, entry.pickUp)

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
              Booking {index + 1}
            </Typography>
            {onRemove && (
              <IconButton size="small" color="error" onClick={onRemove} aria-label="Remove booking">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>

          <FormControlLabel
            control={
              <Checkbox
                checked={entry.timesTbd}
                onChange={setCheck('timesTbd')}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                Times TBD{' '}
                <Typography component="span" variant="body2" color="text.secondary">
                  (saves as all-day)
                </Typography>
              </Typography>
            }
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {entry.timesTbd ? (
              <DatePicker
                label="Drop-off Date"
                value={entry.dropOff}
                onChange={set('dropOff')}
                disablePast
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: 'small',
                    error: !!errors.dropOff,
                    helperText: errors.dropOff,
                  },
                }}
              />
            ) : (
              <DateTimePicker
                label="Drop-off Date & Time"
                value={entry.dropOff}
                onChange={set('dropOff')}
                disablePast
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: 'small',
                    error: !!errors.dropOff,
                    helperText: errors.dropOff,
                  },
                }}
              />
            )}
            {entry.timesTbd ? (
              <DatePicker
                label="Pick-up Date"
                value={entry.pickUp}
                onChange={set('pickUp')}
                disablePast
                minDate={entry.dropOff ?? undefined}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: 'small',
                    error: !!errors.pickUp,
                    helperText: errors.pickUp,
                  },
                }}
              />
            ) : (
              <DateTimePicker
                label="Pick-up Date & Time"
                value={entry.pickUp}
                onChange={set('pickUp')}
                disablePast
                minDateTime={entry.dropOff ?? undefined}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: 'small',
                    error: !!errors.pickUp,
                    helperText: errors.pickUp,
                  },
                }}
              />
            )}
          </Stack>

          <FormControlLabel
            control={
              <Checkbox
                checked={entry.pickupDropoff}
                onChange={setCheck('pickupDropoff')}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                Include pickup &amp; drop-off service{' '}
                <Typography component="span" variant="body2" color="text.secondary">
                  (+£15)
                </Typography>
              </Typography>
            }
          />

          {service && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip label={service} size="small" color={SERVICE_COLOR[service] ?? 'default'} />
              {price !== null && (
                <Typography variant="body2" fontWeight={700}>
                  £{price.toFixed(2)}
                </Typography>
              )}
              {price !== null && (
                <Typography variant="caption" color="text.secondary">
                  {priceBreakdown(entry.dropOff, entry.pickUp, entry.pickupDropoff)}
                </Typography>
              )}
            </Stack>
          )}

          <Box>
            <Link
              component="button"
              type="button"
              variant="body2"
              underline="hover"
              onClick={() => setNotesOpen((o) => !o)}
            >
              {notesOpen ? 'Hide notes ▴' : 'Add notes ▾'}
            </Link>
            <Collapse in={notesOpen}>
              <TextField
                label="Notes"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={entry.notes}
                onChange={setNotes}
                placeholder="Feeding instructions, medical needs…"
                sx={{ mt: 1 }}
              />
            </Collapse>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}
