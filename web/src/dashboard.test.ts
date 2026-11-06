import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { compareDay, csvFileName, formatDateTime, formatMoney, toStayRows } from './dashboard.ts'
import { booking, cancelledBooking } from './test/fixtures.ts'

describe('toStayRows', () => {
  it('makes one row per stay, carrying the booking details onto each', () => {
    const rows = toStayRows([booking, cancelledBooking])

    expect(rows.map((r) => r.stayId)).toEqual([31, 32, 33])
    expect(rows[0]).toEqual({
      stayId: 31,
      bookingId: 12,
      client: 'Sarah Lee',
      dog: 'Biscuit',
      service: 'Boarding',
      dropOff: '2030-11-02 09:00',
      pickUp: '2030-11-04',
      nights: 2,
      unitRate: 40,
      pickupDropoffFee: 15,
      price: 95,
      status: 'Confirmed',
      paid: 'No',
      bookedOn: '2030-10-30',
      notes: 'Allergic to chicken',
    })
    expect(rows[1]).toMatchObject({ bookingId: 12, service: 'Day Care', nights: 0, notes: 'Allergic to chicken' })
  })

  it('keeps cancelled stays, with no notes as an empty string', () => {
    const [row] = toStayRows([cancelledBooking])

    expect(row).toMatchObject({ status: 'Cancelled', dropOff: '2030-11-12', pickUp: '2030-11-12', notes: '' })
  })

  it('marks a paid booking', () => {
    const [row] = toStayRows([{ ...booking, paidAt: '2030-11-05T10:00:00Z' }])

    expect(row.paid).toBe('Yes')
  })

  it('returns no rows for no bookings', () => {
    expect(toStayRows([])).toEqual([])
  })
})

describe('formatters', () => {
  it('shows a date with its time, or "(time TBD)" without one', () => {
    expect(formatDateTime('2030-11-02 09:00')).toBe('Sat, 2 Nov 2030 at 9:00 AM')
    expect(formatDateTime('2030-11-04')).toBe('Mon, 4 Nov 2030 (time TBD)')
  })

  it('shows money in pounds with pence', () => {
    expect(formatMoney(95)).toBe('£95.00')
    expect(formatMoney(12.5)).toBe('£12.50')
  })
})

describe('compareDay', () => {
  const day = dayjs('2030-11-02').toDate()

  it('matches the same day whatever the time', () => {
    expect(compareDay(day, '2030-11-02 09:00')).toBe(0)
    expect(compareDay(day, '2030-11-02')).toBe(0)
  })

  it('orders other days before or after', () => {
    expect(compareDay(day, '2030-11-01 23:00')).toBe(-1)
    expect(compareDay(day, '2030-11-03')).toBe(1)
  })
})

describe('csvFileName', () => {
  it("names the file with today's date", () => {
    expect(csvFileName(dayjs('2026-11-03'))).toBe('dd-pet-care-stays-2026-11-03.csv')
  })
})
