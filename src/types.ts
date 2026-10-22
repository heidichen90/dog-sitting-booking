import type { Dayjs } from 'dayjs'

export type Service = 'Day Care' | 'Boarding'

/** A saved, submitted booking (what's persisted to storage). */
export interface Booking {
  id: number
  dogName: string
  ownerName: string
  service: Service | ''
  dropOff: string
  pickUp: string
  timesTbd: boolean
  price: number
  notes: string
  pickupDropoff: boolean
  createdAt: string
}

/** One in-progress booking entry being filled out in the form, before submission. */
export interface BookingDraft {
  id: number
  dropOff: Dayjs | null
  pickUp: Dayjs | null
  timesTbd: boolean
  pickupDropoff: boolean
  notes: string
}

/** Fields shared across all entries in a single form submission. */
export interface SharedBookingFields {
  dogName: string
  ownerName: string
  dayRate: number | string
  overnightRate: number | string
}

export interface SharedFieldErrors {
  dogName?: string
  ownerName?: string
  dayRate?: string
  overnightRate?: string
}

export interface EntryFieldErrors {
  dropOff?: string
  pickUp?: string
}
