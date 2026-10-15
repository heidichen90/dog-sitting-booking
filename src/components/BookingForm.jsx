import { useState } from 'react'
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
import BookingEntry from './BookingEntry'
import { deriveService, calcPrice } from '../utils'

function newEntry(index) {
  return {
    id: Date.now() + index,
    dropOff: null,
    pickUp: null,
    timesTbd: true,
    pickupDropoff: false,
    notes: '',
  }
}

const emptyShared = { dogName: '', ownerName: '', dayRate: 35, overnightRate: 40 }

export default function BookingForm({ onSubmit }) {
  const [shared, setShared] = useState(emptyShared)
  const [entries, setEntries] = useState([newEntry(0)])
  const [sharedErrors, setSharedErrors] = useState({})
  const [entryErrors, setEntryErrors] = useState({})

  const setSharedField = (field) => (e) =>
    setShared((s) => ({ ...s, [field]: e.target.value }))

  function updateEntry(id, updated) {
    setEntries((es) => es.map((e) => (e.id === id ? updated : e)))
  }

  function removeEntry(id) {
    setEntries((es) => es.filter((e) => e.id !== id))
  }

  function addEntry() {
    setEntries((es) => [...es, newEntry(es.length)])
  }

  function validate() {
    const sErr = {}
    if (!shared.dogName.trim()) sErr.dogName = 'Required'
    if (!shared.ownerName.trim()) sErr.ownerName = 'Required'
    if(!shared.dayRate || isNaN(shared.dayRate) || shared.dayRate <= 0) sErr.dayRate = 'Must be a positive number'
    if(!shared.overnightRate || isNaN(shared.overnightRate) || shared.overnightRate <= 0) sErr.overnightRate = 'Must be a positive number'

    const eErr = {}
    entries.forEach((entry) => {
      const err = {}
      if (!entry.dropOff || !dayjs(entry.dropOff).isValid()) err.dropOff = 'Required'
      if (!entry.pickUp || !dayjs(entry.pickUp).isValid()) err.pickUp = 'Required'
      if (
        entry.dropOff &&
        entry.pickUp &&
        !dayjs(entry.pickUp).isAfter(dayjs(entry.dropOff))
      )
        err.pickUp = 'Must be after drop-off'
      if (Object.keys(err).length) eErr[entry.id] = err
    })

    return { sErr, eErr }
  }

  const totalPrice = entries.reduce(
    (sum, e) => sum + (calcPrice(e.dropOff, e.pickUp, e.pickupDropoff, shared.dayRate, shared.overnightRate) ?? 0),
    0,
  )

  function handleSubmit(ev) {
    ev.preventDefault()
    const { sErr, eErr } = validate()
    if (Object.keys(sErr).length || Object.keys(eErr).length) {
      setSharedErrors(sErr)
      setEntryErrors(eErr)
      return
    }
    const now = new Date().toISOString()
    const bookings = entries.map((entry, i) => ({
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
              <Typography variant="h6" fontWeight={700} color="primary">
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
