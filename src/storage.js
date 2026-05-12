const KEY = 'dogSittingBookings'

export function getBookings() {
  return JSON.parse(localStorage.getItem(KEY) || '[]')
}

export function saveBooking(booking) {
  const list = getBookings()
  list.unshift(booking)
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function deleteBooking(id) {
  const list = getBookings().filter((b) => b.id !== id)
  localStorage.setItem(KEY, JSON.stringify(list))
}
