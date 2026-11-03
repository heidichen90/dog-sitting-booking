import type { components } from '../api/schema'

type Schemas = components['schemas']

export const sarah: Schemas['ClientResponse'] = {
  id: 1,
  name: 'Sarah Lee',
  phone: '+447700900123',
  dogs: [
    { id: 11, name: 'Biscuit' },
    { id: 12, name: 'Pepper' },
  ],
}

export const tom: Schemas['ClientResponse'] = {
  id: 2,
  name: 'Tom Hall',
  phone: null,
  dogs: [{ id: 21, name: 'Rex' }],
}

export const clients: Schemas['ClientResponse'][] = [sarah, tom]

export const booking: Schemas['BookingResponse'] = {
  id: 12,
  status: 'confirmed',
  notes: 'Allergic to chicken',
  paidAt: null,
  createdAt: '2030-10-30T09:12:00Z',
  client: { id: 1, name: 'Sarah Lee', phone: '+447700900123' },
  dog: { id: 11, name: 'Biscuit' },
  total: 130,
  stays: [
    {
      id: 31,
      service: 'boarding',
      dropOffDate: '2030-11-02',
      dropOffTime: '09:00',
      pickUpDate: '2030-11-04',
      pickUpTime: null,
      unitRate: 40,
      pickupDropoffFee: 15,
      price: 95,
      status: 'confirmed',
    },
    {
      id: 32,
      service: 'day_care',
      dropOffDate: '2030-11-10',
      dropOffTime: '08:30',
      pickUpDate: '2030-11-10',
      pickUpTime: '17:00',
      unitRate: 35,
      pickupDropoffFee: 0,
      price: 35,
      status: 'confirmed',
    },
  ],
}

export const cancelledBooking: Schemas['BookingResponse'] = {
  id: 13,
  status: 'cancelled',
  notes: null,
  paidAt: null,
  createdAt: '2030-10-29T10:00:00Z',
  client: { id: 2, name: 'Tom Hall', phone: null },
  dog: { id: 21, name: 'Rex' },
  total: 0,
  stays: [
    {
      id: 33,
      service: 'day_care',
      dropOffDate: '2030-11-12',
      dropOffTime: null,
      pickUpDate: '2030-11-12',
      pickUpTime: null,
      unitRate: 35,
      pickupDropoffFee: 0,
      price: 35,
      status: 'cancelled',
    },
  ],
}
