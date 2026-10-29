import { useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Box,
  Button,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PetsIcon from '@mui/icons-material/Pets'
import dayjs from 'dayjs'
import BookingEntry from './BookingEntry.tsx'
import { deriveService, calcPrice } from '../utils.ts'
import type {
  Booking,
  BookingDraft,
  EntryFieldErrors,
  SharedBookingFields,
  SharedFieldErrors,
} from '../types'

function newEntry(index: number): BookingDraft {
  return {
    id: Date.now() + index,
    dropOff: null,
    pickUp: null,
    timesTbd: true,
    pickupDropoff: false,
    notes: '',
  }
}

const emptyShared: SharedBookingFields = { dogName: '', ownerName: '', dayRate: 35, overnightRate: 40 }

interface BookingFormProps {
  onSubmit: (bookings: Booking[]) => void
}

export default function BookingForm({ onSubmit }: BookingFormProps) {
  const [shared, setShared] = useState<SharedBookingFields>(emptyShared)
  const [entries, setEntries] = useState<BookingDraft[]>([newEntry(0)])
  const [sharedErrors, setSharedErrors] = useState<SharedFieldErrors>({})
  const [entryErrors, setEntryErrors] = useState<Record<number, EntryFieldErrors>>({})

  const setSharedField = (field: keyof SharedBookingFields) => (e: ChangeEvent<HTMLInputElement>) =>
    setShared((s) => ({ ...s, [field]: e.target.value }))

  function updateEntry(id: number, updated: BookingDraft) {
    setEntries((es) => es.map((e) => (e.id === id ? updated : e)))
  }

  function removeEntry(id: number) {
    setEntries((es) => es.filter((e) => e.id !== id))
  }

  function addEntry() {
    setEntries((es) => [...es, newEntry(es.length)])
  }

  function validate(): { sErr: SharedFieldErrors; eErr: Record<number, EntryFieldErrors> } {
    const sErr: SharedFieldErrors = {}
    if (!shared.dogName.trim()) sErr.dogName = 'Required'
    if (!shared.ownerName.trim()) sErr.ownerName = 'Required'
    const dayRateNum = Number(shared.dayRate)
    if (!shared.dayRate || isNaN(dayRateNum) || dayRateNum <= 0) sErr.dayRate = 'Must be a positive number'
    const overnightRateNum = Number(shared.overnightRate)
    if (!shared.overnightRate || isNaN(overnightRateNum) || overnightRateNum <= 0) sErr.overnightRate = 'Must be a positive number'

    const eErr: Record<number, EntryFieldErrors> = {}
    entries.forEach((entry) => {
      const err: EntryFieldErrors = {}
      if (!entry.dropOff || !dayjs(entry.dropOff).isValid()) err.dropOff = 'Required'
      if (!entry.pickUp || !dayjs(entry.pickUp).isValid()) err.pickUp = 'Required'
      if (
        entry.dropOff &&
        entry.pickUp &&
        dayjs(entry.pickUp).isBefore(dayjs(entry.dropOff))
      )
        err.pickUp = 'Must be on or after drop-off'
      if (Object.keys(err).length) eErr[entry.id] = err
    })

    return { sErr, eErr }
  }

  const totalPrice = entries.reduce(
    (sum, e) => sum + (calcPrice(e.dropOff, e.pickUp, e.pickupDropoff, shared.dayRate, shared.overnightRate) ?? 0),
    0,
  )

  function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const { sErr, eErr } = validate()
    if (Object.keys(sErr).length || Object.keys(eErr).length) {
      setSharedErrors(sErr)
      setEntryErrors(eErr)
      return
    }
    const now = new Date().toISOString()
    const bookings: Booking[] = entries.map((entry, i) => ({
      id: Date.now() + i,
      dogName: shared.dogName.trim(),
      ownerName: shared.ownerName.trim(),
      service: deriveService(entry.dropOff, entry.pickUp),
      dropOff: dayjs(entry.dropOff).toISOString(),
      pickUp: dayjs(entry.pickUp).toISOString(),
      timesTbd: entry.timesTbd,
      price: calcPrice(entry.dropOff, entry.pickUp, entry.pickupDropoff, shared.dayRate, shared.overnightRate) ?? 0,
      notes: entry.notes.trim(),
      pickupDropoff: entry.pickupDropoff,
      createdAt: now,
    }))
    onSubmit(bookings)
    setShared(emptyShared)
    setEntries([newEntry(0)])
    setSharedErrors({})
    setEntryErrors({})
  }

  const submitLabel =
    entries.length === 1 ? 'Create Booking' : `Create ${entries.length} Bookings`

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Dog's Name"
            fullWidth
            value={shared.dogName}
            onChange={setSharedField('dogName')}
            error={!!sharedErrors.dogName}
            helperText={sharedErrors.dogName}
          />
          <TextField
            label="Owner's Name"
            fullWidth
            value={shared.ownerName}
            onChange={setSharedField('ownerName')}
            error={!!sharedErrors.ownerName}
            helperText={sharedErrors.ownerName}
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Day Rate"
            fullWidth
            value={shared.dayRate}
            onChange={setSharedField('dayRate')}
            error={!!sharedErrors.dayRate}
            helperText={sharedErrors.dayRate}
          />
          <TextField
            label="Overnight Rate"
            fullWidth
            value={shared.overnightRate}
            onChange={setSharedField('overnightRate')}
            error={!!sharedErrors.overnightRate}
            helperText={sharedErrors.overnightRate}
          />
        </Stack>

        <Stack spacing={2}>
          {entries.map((entry, idx) => (
            <BookingEntry
              key={entry.id}
              entry={entry}
              index={idx}
              onChange={(updated) => updateEntry(entry.id, updated)}
              onRemove={entries.length > 1 ? () => removeEntry(entry.id) : null}
              errors={entryErrors[entry.id] ?? {}}
              dayRate={shared.dayRate}
              overnightRate={shared.overnightRate}
            />
          ))}
        </Stack>

        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={addEntry}
          sx={{ alignSelf: 'flex-start' }}
        >
          Add another booking
        </Button>

        {entries.length > 1 && totalPrice > 0 && (
          <>
            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }} >
              <Typography variant="body2" color="text.secondary">
                Total ({entries.length} bookings)
              </Typography>
              <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
                £{totalPrice.toFixed(2)}
              </Typography>
            </Stack>
          </>
        )}

        <Button
          type="submit"
          variant="contained"
          size="large"
          startIcon={<PetsIcon />}
          sx={{ py: 1.5, borderRadius: 2, fontWeight: 700 }}
        >
          {submitLabel}
        </Button>
      </Stack>
    </Box>
  )
}
