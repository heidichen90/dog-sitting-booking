import type { Dayjs } from 'dayjs'
import type { components } from './api/schema'

type Schemas = components['schemas']

export type Booking = Schemas['BookingResponse']
export type Stay = Schemas['StayResponse']
export type Client = Schemas['ClientResponse']
export type Dog = Schemas['DogResponse']
export type CreateBookingRequest = Schemas['CreateBookingRequest']
export type StayRequest = Schemas['StayRequest']
export type FieldError = Schemas['FieldError']
export type ExistingClient = Schemas['ExistingClient']
export type Service = Stay['service']

/** One day being filled in on the form, before submission. */
export interface BookingDraft {
  id: number
  dropOff: Dayjs | null
  pickUp: Dayjs | null
  timesTbd: boolean
  pickupDropoff: boolean
}

/** The client picker's value: a client on file, or the name typed for a new one. */
export type ClientChoice = { kind: 'existing'; client: Client } | { kind: 'new'; name: string }

/** The dog picker's value: one of the chosen client's dogs, or the name typed for a new one. */
export type DogChoice = { kind: 'existing'; dog: Dog } | { kind: 'new'; name: string }

/** Fields shared by every day of one booking. */
export interface SharedBookingFields {
  client: ClientChoice | null
  phone: string
  dog: DogChoice | null
  notes: string
  dayRate: number | string
  overnightRate: number | string
}

export interface SharedFieldErrors {
  client?: string
  phone?: string
  dog?: string
  notes?: string
  dayRate?: string
  overnightRate?: string
}

export interface EntryFieldErrors {
  dropOff?: string
  pickUp?: string
  pickupDropoff?: string
}
