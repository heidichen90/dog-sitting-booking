import type { Booking } from './types'

const KEY = 'dogSittingBookings'

export function getBookings(): Booking[] {
  return JSON.parse(localStorage.getItem(KEY) || '[]')
}

export function saveBooking(booking: Booking): void {
  const list = getBookings()
  list.unshift(booking)
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function deleteBooking(id: number): void {
  const list = getBookings().filter((b) => b.id !== id)
  localStorage.setItem(KEY, JSON.stringify(list))
}
