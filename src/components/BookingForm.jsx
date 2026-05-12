import { useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import PetsIcon from '@mui/icons-material/Pets'
import dayjs from 'dayjs'

const empty = {
  dogName: '',
  ownerName: '',
  dropOff: null,
  pickUp: null,
  timesTbd: false,
  notes: '',
  pickupDropoff: false,
}

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

export default function BookingForm({ onSubmit }) {
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})

  const setField = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))
  const setDate = (field) => (val) =>
    setForm((f) => ({ ...f, [field]: val }))

  const price = calcPrice(form.dropOff, form.pickUp, form.pickupDropoff)
  const service = deriveService(form.dropOff, form.pickUp)

  function validate() {
    const e = {}
    if (!form.dogName.trim()) e.dogName = 'Required'
    if (!form.ownerName.trim()) e.ownerName = 'Required'
    if (!form.dropOff || !dayjs(form.dropOff).isValid()) e.dropOff = 'Required'
    if (!form.pickUp || !dayjs(form.pickUp).isValid()) e.pickUp = 'Required'
    if (form.dropOff && form.pickUp && !dayjs(form.pickUp).isAfter(dayjs(form.dropOff)))
      e.pickUp = 'Must be after drop-off'
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    onSubmit({
      id: Date.now(),
      dogName: form.dogName.trim(),
      ownerName: form.ownerName.trim(),
      service,
      dropOff: dayjs(form.dropOff).toISOString(),
      pickUp: dayjs(form.pickUp).toISOString(),
      timesTbd: form.timesTbd,
      price: price ?? 0,
      notes: form.notes.trim(),
      pickupDropoff: form.pickupDropoff,
      createdAt: new Date().toISOString(),
    })
    setForm(empty)
    setErrors({})
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Dog's Name"
            fullWidth
            value={form.dogName}
            onChange={setField('dogName')}
            error={!!errors.dogName}
            helperText={errors.dogName}
          />
          <TextField
            label="Owner's Name"
            fullWidth
            value={form.ownerName}
            onChange={setField('ownerName')}
            error={!!errors.ownerName}
            helperText={errors.ownerName}
          />
        </Stack>

        <FormControlLabel
          control={
            <Checkbox
              checked={form.timesTbd}
              onChange={(e) =>
                setForm((f) => ({ ...f, timesTbd: e.target.checked }))
              }
            />
          }
          label={
            <Typography component="span">
              Times TBD{' '}
              <Typography component="span" color="text.secondary" fontSize="0.85em">
                (confirm exact times later — saves as all-day calendar event)
              </Typography>
            </Typography>
          }
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {form.timesTbd ? (
            <DatePicker
              label="Drop-off Date"
              value={form.dropOff}
              onChange={setDate('dropOff')}
              disablePast
              slotProps={{
                textField: {
                  fullWidth: true,
                  error: !!errors.dropOff,
                  helperText: errors.dropOff,
                },
              }}
            />
          ) : (
            <DateTimePicker
              label="Drop-off Date & Time"
              value={form.dropOff}
              onChange={setDate('dropOff')}
              disablePast
              slotProps={{
                textField: {
                  fullWidth: true,
                  error: !!errors.dropOff,
                  helperText: errors.dropOff,
                },
              }}
            />
          )}
          {form.timesTbd ? (
            <DatePicker
              label="Pick-up Date"
              value={form.pickUp}
              onChange={setDate('pickUp')}
              disablePast
              minDate={form.dropOff ?? undefined}
              slotProps={{
                textField: {
                  fullWidth: true,
                  error: !!errors.pickUp,
                  helperText: errors.pickUp,
                },
              }}
            />
          ) : (
            <DateTimePicker
              label="Pick-up Date & Time"
              value={form.pickUp}
              onChange={setDate('pickUp')}
              disablePast
              minDateTime={form.dropOff ?? undefined}
              slotProps={{
                textField: {
                  fullWidth: true,
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
              checked={form.pickupDropoff}
              onChange={(e) =>
                setForm((f) => ({ ...f, pickupDropoff: e.target.checked }))
              }
            />
          }
          label={
            <Typography component="span">
              Include pickup &amp; drop-off service {' '}
              <Typography component="span" color="text.secondary" fontSize="0.85em">
                (+£15)
              </Typography>
            </Typography>
          }
        />

        <TextField
          label="Price"
          fullWidth
          value={price !== null ? `£${price.toFixed(2)}` : ''}
          placeholder="Set dates above to calculate"
          slotProps={{
            input: { readOnly: true },
          }}
          helperText={priceBreakdown(form.dropOff, form.pickUp, form.pickupDropoff)}
          sx={{ '& input': { fontWeight: 700, fontSize: '1.1rem' } }}
        />

        <TextField
          label="Notes (optional)"
          multiline
          rows={3}
          fullWidth
          value={form.notes}
          onChange={setField('notes')}
          placeholder="Feeding instructions, medical needs, special requirements…"
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          startIcon={<PetsIcon />}
          sx={{ py: 1.5, borderRadius: 2, fontWeight: 700 }}
        >
          Create Booking
        </Button>
      </Stack>
    </Box>
  )
}
