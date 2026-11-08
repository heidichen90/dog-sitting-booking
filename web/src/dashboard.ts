import dayjs from 'dayjs'
import type { ColDef } from 'ag-grid-community'
import { SERVICE_LABEL, fmt } from './utils.ts'
import type { Booking } from './types'

/** One stay with its booking's details, as shown in the dashboard grid and its CSV. */
export interface StayRow {
  stayId: number
  bookingId: number
  client: string
  dog: string
  service: string
  dropOff: string
  pickUp: string
  nights: number
  unitRate: number
  pickupDropoffFee: number
  price: number
  status: string
  paid: string
  bookedOn: string
  notes: string
}

const STATUS_LABEL = { confirmed: 'Confirmed', cancelled: 'Cancelled' } as const

// "YYYY-MM-DD HH:mm", or "YYYY-MM-DD" when the time is TBD: sorts in time order and is the CSV value.
function dateTime(date: string, time: string | null): string {
  return time ? `${date} ${time}` : date
}

export function toStayRows(bookings: Booking[]): StayRow[] {
  return bookings.flatMap((b) =>
    b.stays.map((s) => ({
      stayId: s.id,
      bookingId: b.id,
      client: b.client.name,
      dog: b.dog.name,
      service: SERVICE_LABEL[s.service],
      dropOff: dateTime(s.dropOffDate, s.dropOffTime),
      pickUp: dateTime(s.pickUpDate, s.pickUpTime),
      nights: dayjs(s.pickUpDate).diff(dayjs(s.dropOffDate), 'day'),
      unitRate: s.unitRate,
      pickupDropoffFee: s.pickupDropoffFee,
      price: s.price,
      status: STATUS_LABEL[s.status],
      paid: b.paidAt ? 'Yes' : 'No',
      bookedOn: dayjs(b.createdAt).format('YYYY-MM-DD'),
      notes: b.notes ?? '',
    })),
  )
}

export function formatDateTime(value: string): string {
  const [date, time] = value.split(' ')
  return fmt(date, time ?? null)
}

export function formatMoney(value: number): string {
  return `£${value.toFixed(2)}`
}

/** Matches a "YYYY-MM-DD…" cell against the date filter's chosen day, ignoring the time. */
export function compareDay(filterDate: Date, cellValue: string): number {
  const cellDay = dayjs(cellValue.slice(0, 10)).valueOf()
  const filterDay = filterDate.getTime()
  return cellDay < filterDay ? -1 : cellDay > filterDay ? 1 : 0
}

const dateTimeLabel = ({ value }: { value?: string | null }) => (value ? formatDateTime(value) : '')

const dateTimeColumn: ColDef<StayRow> = {
  minWidth: 230,
  filter: 'agDateColumnFilter',
  filterParams: { comparator: compareDay },
  valueFormatter: dateTimeLabel,
  getQuickFilterText: dateTimeLabel,
}

const moneyLabel = ({ value }: { value?: number | null }) => (value == null ? '' : formatMoney(value))

const moneyColumn: ColDef<StayRow> = {
  filter: 'agNumberColumnFilter',
  valueFormatter: moneyLabel,
  getQuickFilterText: moneyLabel,
}

const bookedOnLabel = ({ value }: { value?: string | null }) => (value ? dayjs(value).format('D MMM YYYY') : '')

export const COLUMNS: ColDef<StayRow>[] = [
  { field: 'bookingId', headerName: 'Booking #', filter: 'agNumberColumnFilter', width: 120 },
  { field: 'client', headerName: 'Client', filter: 'agTextColumnFilter' },
  { field: 'dog', headerName: 'Dog', filter: 'agTextColumnFilter' },
  { field: 'service', headerName: 'Service', filter: 'agTextColumnFilter', width: 130 },
  { field: 'dropOff', headerName: 'Drop-off', sort: 'asc', ...dateTimeColumn },
  { field: 'pickUp', headerName: 'Pick-up', ...dateTimeColumn },
  { field: 'nights', headerName: 'Nights', filter: 'agNumberColumnFilter', width: 110 },
  { field: 'unitRate', headerName: 'Unit rate', width: 120, ...moneyColumn },
  { field: 'pickupDropoffFee', headerName: 'Pickup/drop-off fee', width: 170, ...moneyColumn },
  { field: 'price', headerName: 'Price', width: 110, ...moneyColumn },
  { field: 'status', headerName: 'Status', filter: 'agTextColumnFilter', width: 130 },
  { field: 'paid', headerName: 'Paid', filter: 'agTextColumnFilter', width: 100 },
  {
    field: 'bookedOn',
    headerName: 'Booked on',
    filter: 'agDateColumnFilter',
    filterParams: { comparator: compareDay },
    valueFormatter: bookedOnLabel,
    getQuickFilterText: bookedOnLabel,
    width: 140,
  },
  { field: 'notes', headerName: 'Notes', filter: 'agTextColumnFilter', minWidth: 200, flex: 1 },
]

export const DEFAULT_COL_DEF: ColDef<StayRow> = { sortable: true, resizable: true, useValueFormatterForExport: false }

export function csvFileName(today: dayjs.Dayjs = dayjs()): string {
  return `dd-pet-care-stays-${today.format('YYYY-MM-DD')}.csv`
}
