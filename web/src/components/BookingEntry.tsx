import type { ChangeEvent } from 'react'
import {
  Box,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  FormHelperText,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import dayjs, { type Dayjs } from 'dayjs'
import { SERVICE_COLOR, SERVICE_LABEL, calcPrice, deriveService, priceBreakdown } from '../utils.ts'
import type { BookingDraft, EntryFieldErrors } from '../types'

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
  const handleChange =
    (field: 'dropOff' | 'pickUp') => (val: Dayjs | null) =>
      onChange({ ...entry, [field]: val })
  const handlePickupDropoffChange = (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...entry, pickupDropoff: e.target.checked })
  const handleTimesTbdChange = (e: ChangeEvent<HTMLInputElement>) => {
    const tbd = e.target.checked
    const updated = { ...entry, timesTbd: tbd }
    if (tbd) {
      if (updated.dropOff) updated.dropOff = dayjs(updated.dropOff).startOf('day')
      if (updated.pickUp) updated.pickUp = dayjs(updated.pickUp).startOf('day')
    }
    onChange(updated)
  }

  const price = calcPrice(entry.dropOff, entry.pickUp, entry.pickupDropoff, dayRate, overnightRate)
  const service = deriveService(entry.dropOff, entry.pickUp)

  return (
    <Card component="section" aria-label={`Day ${index + 1}`} variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700 }}>
              Day {index + 1}
            </Typography>
            {onRemove && (
              <IconButton size="small" color="error" onClick={onRemove} aria-label={`Remove day ${index + 1}`}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>

          <FormControlLabel
            control={<Checkbox checked={entry.timesTbd} onChange={handleTimesTbdChange} size="small" />}
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
                  textField: { fullWidth: true, size: 'small', error: !!errors.dropOff, helperText: errors.dropOff },
                }}
              />
            ) : (
              <DateTimePicker
                label="Drop-off Date & Time"
                value={entry.dropOff}
                onChange={handleChange('dropOff')}
                disablePast
                slotProps={{
                  textField: { fullWidth: true, size: 'small', error: !!errors.dropOff, helperText: errors.dropOff },
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
                  textField: { fullWidth: true, size: 'small', error: !!errors.pickUp, helperText: errors.pickUp },
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
                  textField: { fullWidth: true, size: 'small', error: !!errors.pickUp, helperText: errors.pickUp },
                }}
              />
            )}
          </Stack>

          <Box>
            <FormControlLabel
              control={
                <Checkbox checked={entry.pickupDropoff} onChange={handlePickupDropoffChange} size="small" />
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
            {errors.pickupDropoff && <FormHelperText error>{errors.pickupDropoff}</FormHelperText>}
          </Box>

          {service && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={SERVICE_LABEL[service]} size="small" color={SERVICE_COLOR[service]} />
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
        </Stack>
      </CardContent>
    </Card>
  )
}
