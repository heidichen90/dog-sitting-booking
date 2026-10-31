import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  buildCreateRequest,
  buildICS,
  deriveService,
  generateGCalLink,
  generateWhatsAppMessage,
  mapFieldErrors,
  type BookingRequestInput,
} from './utils.ts'
import { booking, sarah } from './test/fixtures.ts'
import type { BookingDraft } from './types'

function day(dropOff: string, pickUp: string, overrides: Partial<BookingDraft> = {}): BookingDraft {
  return { id: 1, dropOff: dayjs(dropOff), pickUp: dayjs(pickUp), timesTbd: false, pickupDropoff: false, ...overrides }
}

const input: BookingRequestInput = {
  client: { kind: 'existing', client: sarah },
  phone: null,
  dog: { kind: 'existing', dog: sarah.dogs[0] },
  notes: '',
  dayRate: 35,
  overnightRate: 40,
  entries: [day('2030-11-02T09:00', '2030-11-02T17:30')],
}

describe('deriveService', () => {
  it('is day care on the same date, boarding across dates, and nothing when pick-up is first', () => {
    expect(deriveService(dayjs('2030-11-02T09:00'), dayjs('2030-11-02T17:00'))).toBe('day_care')
    expect(deriveService(dayjs('2030-11-02'), dayjs('2030-11-04'))).toBe('boarding')
    expect(deriveService(dayjs('2030-11-04'), dayjs('2030-11-02'))).toBeNull()
  })
})

describe('buildCreateRequest', () => {
  it('sends a picked client and dog as ids', () => {
    const request = buildCreateRequest(input)
    expect(request.client).toEqual({ id: 1 })
    expect(request.dog).toEqual({ id: 11 })
  })

  it('sends a new client with phone and a new dog by name, trimmed', () => {
    const request = buildCreateRequest({
      ...input,
      client: { kind: 'new', name: ' Jane Doe ' },
      phone: '+447700900456',
      dog: { kind: 'new', name: 'Rolo ' },
    })
    expect(request.client).toEqual({ name: 'Jane Doe', phone: '+447700900456' })
    expect(request.dog).toEqual({ name: 'Rolo' })
  })

  it('leaves phone out for a new client without one', () => {
    const request = buildCreateRequest({ ...input, client: { kind: 'new', name: 'Jane Doe' } })
    expect(request.client).toEqual({ name: 'Jane Doe' })
  })

  it('uses the day rate for day care', () => {
    expect(buildCreateRequest(input).stays[0].unitRate).toBe(35)
  })

  it('uses the overnight rate for a multi-night stay', () => {
    const request = buildCreateRequest({ ...input, entries: [day('2030-11-02T09:00', '2030-11-05T17:00')] })
    expect(request.stays[0].unitRate).toBe(40)
  })

  it('sends a 15.00 fee when the pickup tick box is ticked, else 0', () => {
    const request = buildCreateRequest({
      ...input,
      entries: [
        day('2030-11-02T09:00', '2030-11-02T17:00', { pickupDropoff: true }),
        day('2030-11-03T09:00', '2030-11-03T17:00', { id: 2 }),
      ],
    })
    expect(request.stays.map((stay) => stay.pickupDropoffFee)).toEqual([15, 0])
  })

  it('sends null times when times are TBD', () => {
    const request = buildCreateRequest({
      ...input,
      entries: [day('2030-11-02', '2030-11-04', { timesTbd: true })],
    })
    expect(request.stays[0]).toMatchObject({
      dropOffDate: '2030-11-02',
      dropOffTime: null,
      pickUpDate: '2030-11-04',
      pickUpTime: null,
    })
  })

  it('sends HH:mm times for a day with times', () => {
    expect(buildCreateRequest(input).stays[0]).toMatchObject({
      dropOffDate: '2030-11-02',
      dropOffTime: '09:00',
      pickUpDate: '2030-11-02',
      pickUpTime: '17:30',
    })
  })

  it('trims notes and sends blank notes as null', () => {
    expect(buildCreateRequest({ ...input, notes: '  Allergic to chicken ' }).notes).toBe('Allergic to chicken')
    expect(buildCreateRequest({ ...input, notes: '   ' }).notes).toBeNull()
  })
})

describe('mapFieldErrors', () => {
  it('maps API field paths to the form inputs they belong to', () => {
    const entries = [day('2030-11-02', '2030-11-02', { id: 7 }), day('2030-11-03', '2030-11-05', { id: 8 })]

    const mapped = mapFieldErrors(
      [
        { field: 'client.phone', message: 'bad phone' },
        { field: 'dog', message: 'give either id or name' },
        { field: 'notes', message: 'too long' },
        { field: 'stays[1].pickUpDate', message: 'too many nights' },
        { field: 'stays[0].unitRate', message: 'day rate too big' },
        { field: 'stays[1].unitRate', message: 'overnight rate too big' },
        { field: 'stays[0].pickupDropoffFee', message: 'negative' },
        { field: 'stays', message: 'must not be empty' },
        { field: 'somethingElse', message: 'odd' },
      ],
      entries,
    )

    expect(mapped.shared).toEqual({
      phone: 'bad phone',
      dog: 'give either id or name',
      notes: 'too long',
      dayRate: 'day rate too big',
      overnightRate: 'overnight rate too big',
    })
    expect(mapped.entries).toEqual({ 7: { pickupDropoff: 'negative' }, 8: { pickUp: 'too many nights' } })
    expect(mapped.stays).toBe('must not be empty')
    expect(mapped.unmapped).toEqual(['somethingElse: odd'])
  })
})

describe('calendar events', () => {
  it("gives each day's event a UID from its stay id", () => {
    expect(buildICS(booking, booking.stays[0])).toContain('UID:stay-31@dogsitting.app')
    expect(buildICS(booking, booking.stays[1])).toContain('UID:stay-32@dogsitting.app')
  })

  it('makes an all-day event when a time is TBD and a timed one otherwise', () => {
    const tbd = buildICS(booking, booking.stays[0])
    expect(tbd).toContain('DTSTART;VALUE=DATE:20301102')
    expect(tbd).toContain('DTEND;VALUE=DATE:20301105')

    const timed = buildICS(booking, booking.stays[1])
    expect(timed).toContain('DTSTART:20301110T083000')
    expect(timed).toContain('DTEND:20301110T170000')
    expect(timed).toContain('SUMMARY:Dog Sitting – Biscuit (Day Care)')
  })

  it('escapes notes in DESCRIPTION so no raw newline breaks the property', () => {
    const ics = buildICS({ ...booking, notes: 'Line 1\nLine 2; a, b' }, booking.stays[1])
    const description = ics.split('\r\n').find((line) => line.startsWith('DESCRIPTION:'))
    expect(description).toBe('DESCRIPTION:Owner: Sarah Lee\\nPrice: £35.00\\nNotes: Line 1\\nLine 2\\; a\\, b')
    expect(ics.split('\r\n').every((line) => !line.includes('\n'))).toBe(true)
  })

  it('escapes SUMMARY and stamps DTSTAMP in UTC', () => {
    const ics = buildICS({ ...booking, dog: { id: 11, name: 'Biscuit, Jr; II' } }, booking.stays[1])
    expect(ics).toContain('SUMMARY:Dog Sitting – Biscuit\\, Jr\\; II (Day Care)')
    expect(ics).toMatch(/\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/)
  })

  it('links one Google Calendar event per day', () => {
    const link = generateGCalLink(booking, booking.stays[1])
    expect(link).toContain('&dates=20301110T083000/20301110T170000')
    expect(link).toContain(encodeURIComponent('Dog Sitting – Biscuit (Day Care)'))
  })
})

describe('generateWhatsAppMessage', () => {
  it('lists each day with the server prices, the notes and the total', () => {
    const msg = generateWhatsAppMessage(booking)

    expect(msg).toContain('Hi Sarah Lee! 🐾')
    expect(msg).toContain('Your 2 bookings are confirmed:')
    expect(msg).toContain('— Booking 1 (Boarding) —')
    expect(msg).toContain('📅 Drop-off: Sat, 2 Nov 2030 at 9:00 AM')
    expect(msg).toContain('📅 Pick-up: Mon, 4 Nov 2030 (time TBD)')
    expect(msg).toContain('💷 Price: £95.00')
    expect(msg).toContain('🚗 Pickup & drop-off service: included')
    expect(msg).toContain('📝 Notes: Allergic to chicken')
    expect(msg).toContain('💷 Total: £130.00')
    expect(msg).toContain('We look forward to looking after Biscuit! 🐶')
  })
})
