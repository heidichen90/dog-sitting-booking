import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, AlertTitle, Box, Button, Divider, Stack, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PetsIcon from '@mui/icons-material/Pets'
import dayjs from 'dayjs'
import BookingEntry from './BookingEntry.tsx'
import ClientPicker from './ClientPicker.tsx'
import DogPicker from './DogPicker.tsx'
import { ApiError, createBooking } from '../api/client.ts'
import { PHONE_ERROR, toE164 } from '../phone.ts'
import { buildCreateRequest, calcPrice, mapFieldErrors } from '../utils.ts'
import type {
  Booking,
  BookingDraft,
  Client,
  ClientChoice,
  DogChoice,
  EntryFieldErrors,
  ExistingClient,
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
  }
}

const emptyShared: SharedBookingFields = {
  client: null,
  phone: '',
  dog: null,
  notes: '',
  dayRate: 35,
  overnightRate: 40,
}

/** A dog typed by name is kept for any client; a dog on file is kept only while its client stays chosen. */
function keepDog(dog: DogChoice | null, client: ClientChoice | null): DogChoice | null {
  if (dog?.kind !== 'existing') return dog
  return client?.kind === 'existing' && client.client.dogs.some((d) => d.id === dog.dog.id) ? dog : null
}

interface Banner {
  title: string
  lines: string[]
}

interface BookingFormProps {
  clients: Client[]
  onCreated: (booking: Booking) => void
}

export default function BookingForm({ clients, onCreated }: BookingFormProps) {
  const [shared, setShared] = useState<SharedBookingFields>(emptyShared)
  const [entries, setEntries] = useState<BookingDraft[]>([newEntry(0)])
  const [sharedErrors, setSharedErrors] = useState<SharedFieldErrors>({})
  const [entryErrors, setEntryErrors] = useState<Record<number, EntryFieldErrors>>({})
  const [staysError, setStaysError] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [conflict, setConflict] = useState<ExistingClient | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const setField =
    (field: 'phone' | 'notes' | 'dayRate' | 'overnightRate') => (e: ChangeEvent<HTMLInputElement>) =>
      setShared((s) => ({ ...s, [field]: e.target.value }))

  function setClient(client: ClientChoice | null) {
    setShared((s) => ({
      ...s,
      client,
      dog: keepDog(s.dog, client),
      phone: client?.kind === 'new' ? s.phone : '',
    }))
  }

  function setDog(dog: DogChoice | null) {
    setShared((s) => ({ ...s, dog }))
  }

  function updateEntry(id: number, updated: BookingDraft) {
    setEntries((es) => es.map((e) => (e.id === id ? updated : e)))
  }

  function removeEntry(id: number) {
    setEntries((es) => es.filter((e) => e.id !== id))
  }

  function addEntry() {
    setEntries((es) => [...es, newEntry(es.length)])
  }

  function validate() {
    const sErr: SharedFieldErrors = {}
    let phone: string | null = null
    if (!shared.client || (shared.client.kind === 'new' && !shared.client.name.trim())) sErr.client = 'Required'
    if (shared.client?.kind === 'new' && shared.phone.trim()) {
      phone = toE164(shared.phone)
      if (!phone) sErr.phone = PHONE_ERROR
    }
    if (!shared.dog || (shared.dog.kind === 'new' && !shared.dog.name.trim())) sErr.dog = 'Required'
    const dayRateNum = Number(shared.dayRate)
    if (!shared.dayRate || isNaN(dayRateNum) || dayRateNum <= 0) sErr.dayRate = 'Must be a positive number'
    const overnightRateNum = Number(shared.overnightRate)
    if (!shared.overnightRate || isNaN(overnightRateNum) || overnightRateNum <= 0)
      sErr.overnightRate = 'Must be a positive number'

    const eErr: Record<number, EntryFieldErrors> = {}
    entries.forEach((entry) => {
      const err: EntryFieldErrors = {}
      if (!entry.dropOff || !dayjs(entry.dropOff).isValid()) err.dropOff = 'Required'
      if (!entry.pickUp || !dayjs(entry.pickUp).isValid()) err.pickUp = 'Required'
      if (entry.dropOff && entry.pickUp && dayjs(entry.pickUp).isBefore(dayjs(entry.dropOff)))
        err.pickUp = 'Must be on or after drop-off'
      if (Object.keys(err).length) eErr[entry.id] = err
    })

    return { sErr, eErr, phone }
  }

  function showApiError(err: ApiError) {
    if (err.status === 409 && err.existingClient) {
      setConflict(err.existingClient)
      return
    }
    if (err.status === 400 && err.fieldErrors.length) {
      const mapped = mapFieldErrors(err.fieldErrors, entries)
      setSharedErrors(mapped.shared)
      setEntryErrors(mapped.entries)
      setStaysError(mapped.stays)
      if (mapped.unmapped.length) setBanner({ title: err.title, lines: mapped.unmapped })
      return
    }
    setBanner({ title: err.title, lines: err.detail ? [err.detail] : [] })
  }

  function switchToExistingClient(existing: ExistingClient) {
    const client = clients.find((c) => c.id === existing.id) ?? {
      id: existing.id,
      name: existing.name,
      phone: null,
      dogs: [],
    }
    setClient({ kind: 'existing', client })
    setConflict(null)
  }

  const totalPrice = entries.reduce(
    (sum, e) => sum + (calcPrice(e.dropOff, e.pickUp, e.pickupDropoff, shared.dayRate, shared.overnightRate) ?? 0),
    0,
  )

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const { sErr, eErr, phone } = validate()
    setSharedErrors(sErr)
    setEntryErrors(eErr)
    setStaysError(null)
    setBanner(null)
    setConflict(null)
    if (!shared.client || !shared.dog || Object.keys(sErr).length || Object.keys(eErr).length) return

    setSubmitting(true)
    try {
      const booking = await createBooking(
        buildCreateRequest({
          client: shared.client,
          phone,
          dog: shared.dog,
          notes: shared.notes,
          dayRate: Number(shared.dayRate),
          overnightRate: Number(shared.overnightRate),
          entries,
        }),
      )
      onCreated(booking)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      showApiError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <ClientPicker clients={clients} value={shared.client} onChange={setClient} error={sharedErrors.client} />
          <DogPicker
            dogs={shared.client?.kind === 'existing' ? shared.client.client.dogs : []}
            value={shared.dog}
            onChange={setDog}
            error={sharedErrors.dog}
          />
        </Stack>

        {shared.client?.kind === 'new' && (
          <TextField
            label="Phone (optional)"
            type="tel"
            fullWidth
            value={shared.phone}
            onChange={setField('phone')}
            error={!!sharedErrors.phone}
            helperText={sharedErrors.phone}
          />
        )}

        {conflict && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" onClick={() => switchToExistingClient(conflict)}>
                Use {conflict.name}
              </Button>
            }
          >
            This number belongs to <strong>{conflict.name}</strong>. Use that client?
          </Alert>
        )}

        <TextField
          label="Notes"
          multiline
          rows={2}
          fullWidth
          value={shared.notes}
          onChange={setField('notes')}
          placeholder="Feeding instructions, medical needs…"
          error={!!sharedErrors.notes}
          helperText={sharedErrors.notes}
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Day Rate"
            fullWidth
            value={shared.dayRate}
            onChange={setField('dayRate')}
            error={!!sharedErrors.dayRate}
            helperText={sharedErrors.dayRate}
          />
          <TextField
            label="Overnight Rate"
            fullWidth
            value={shared.overnightRate}
            onChange={setField('overnightRate')}
            error={!!sharedErrors.overnightRate}
            helperText={sharedErrors.overnightRate}
          />
        </Stack>

        {staysError && (
          <Typography variant="body2" color="error">
            {staysError}
          </Typography>
        )}

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

        <Button variant="outlined" startIcon={<AddIcon />} onClick={addEntry} sx={{ alignSelf: 'flex-start' }}>
          Add another day
        </Button>

        {entries.length > 1 && totalPrice > 0 && (
          <>
            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Total ({entries.length} days)
              </Typography>
              <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
                £{totalPrice.toFixed(2)}
              </Typography>
            </Stack>
          </>
        )}

        {banner && (
          <Alert severity="error">
            <AlertTitle>{banner.title}</AlertTitle>
            {banner.lines.map((line) => (
              <Box key={line}>{line}</Box>
            ))}
          </Alert>
        )}

        <Button
          type="submit"
          variant="contained"
          size="large"
          startIcon={<PetsIcon />}
          disabled={submitting}
          sx={{ py: 1.5, borderRadius: 2, fontWeight: 700 }}
        >
          Create Booking
        </Button>
      </Stack>
    </Box>
  )
}
