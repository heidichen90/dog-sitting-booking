import { useState, type ChangeEvent } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import DeleteOutlineIcon from '@mui/icons-material/Delete'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import dayjs, { type Dayjs } from 'dayjs'
import { deriveService, calcPrice, priceBreakdown } from '../utils.ts'
import type { BookingDraft, EntryFieldErrors } from '../types'

const SERVICE_COLOR: Record<string, 'warning' | 'success'> = {
  Boarding: 'warning',
  'Day Care': 'success',
}

interface BookingEntryProps {
  entry: BookingDraft
  onChange: (updated: BookingDraft) => void
  onRemove: (() => void) | null
  index: number
  errors?: EntryFieldErrors
  dayRate: number | string
  overnightRate: number | string
}

export default function BookingEntry({
  entry,
  onChange,
  onRemove,
  index,
  errors = {},
  dayRate,
  overnightRate,
}: BookingEntryProps) {
  const [notesOpen, setNotesOpen] = useState(false)

  const handleChange =
    (field: 'dropOff' | 'pickUp') => (val: Dayjs | null) =>
      onChange({ ...entry, [field]: val })
  const handleCheckChange =
    (field: 'pickupDropoff') => (e: ChangeEvent<HTMLInputElement>) =>
      onChange({ ...entry, [field]: e.target.checked })
  const handleTimesTbdChange = (e: ChangeEvent<HTMLInputElement>) => {
    const tbd = e.target.checked
    const updated = { ...entry, timesTbd: tbd }
    if (tbd) {
      if (updated.dropOff) updated.dropOff = dayjs(updated.dropOff).startOf('day')
      if (updated.pickUp) updated.pickUp = dayjs(updated.pickUp).startOf('day')
    }
    onChange(updated)
  }
  const setNotes = (e: ChangeEvent<HTMLInputElement>) => onChange({ ...entry, notes: e.target.value })

  const price = calcPrice(entry.dropOff, entry.pickUp, entry.pickupDropoff, dayRate, overnightRate)
  const service = deriveService(entry.dropOff, entry.pickUp)

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700 }}>
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
                onChange={handleTimesTbdChange}
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
                onChange={handleChange('dropOff')}
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
                onChange={handleChange('dropOff')}
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
                onChange={handleChange('pickUp')}
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
                onChange={handleChange('pickUp')}
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
                onChange={handleCheckChange('pickupDropoff')}
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
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={service} size="small" color={SERVICE_COLOR[service] ?? 'default'} />
              {price !== null && (
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  £{price.toFixed(2)}
                </Typography>
              )}
              {price !== null && (
                <Typography variant="caption" color="text.secondary">
                  {priceBreakdown(entry.dropOff, entry.pickUp, entry.pickupDropoff, dayRate, overnightRate)}
                </Typography>
              )}
            </Stack>
          )}

          <Box>
            <Button
              variant="text"
              size="small"
              endIcon={notesOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setNotesOpen((o) => !o)}
              sx={{ p: 0, minWidth: 0, textTransform: 'none' }}
            >
              {notesOpen ? 'Hide notes' : 'Add notes'}
            </Button>
            <Collapse in={notesOpen}>
              <TextField
                label="Notes"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={entry.notes ?? ''}
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
