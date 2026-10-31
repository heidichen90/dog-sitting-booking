import dayjs, { type Dayjs } from "dayjs";
import type {
  Booking,
  BookingDraft,
  ClientChoice,
  CreateBookingRequest,
  DogChoice,
  EntryFieldErrors,
  FieldError,
  Service,
  SharedFieldErrors,
  Stay,
  StayRequest,
} from "./types";

export const PICKUP_DROPOFF_FEE = 15;

export const SERVICE_LABEL: Record<Service, string> = {
  day_care: "Day Care",
  boarding: "Boarding",
};

export const SERVICE_COLOR: Record<Service, "success" | "warning"> = {
  day_care: "success",
  boarding: "warning",
};

function nightsBetween(dropOff: Dayjs | null, pickUp: Dayjs | null): number | null {
  if (!dropOff || !pickUp || !dropOff.isValid() || !pickUp.isValid()) return null;
  const nights = pickUp.startOf("day").diff(dropOff.startOf("day"), "day");
  return nights < 0 ? null : nights;
}

export function deriveService(dropOff: Dayjs | null, pickUp: Dayjs | null): Service | null {
  const nights = nightsBetween(dropOff, pickUp);
  if (nights === null) return null;
  return nights === 0 ? "day_care" : "boarding";
}

export function calcPrice(
  dropOff: Dayjs | null,
  pickUp: Dayjs | null,
  pickupDropoff: boolean,
  dayRate: number | string,
  overnightRate: number | string
): number | null {
  const nights = nightsBetween(dropOff, pickUp);
  if (nights === null) return null;
  const base = nights === 0 ? Number(dayRate) : nights * Number(overnightRate);
  return base + (pickupDropoff ? PICKUP_DROPOFF_FEE : 0);
}

export function priceBreakdown(
  dropOff: Dayjs | null,
  pickUp: Dayjs | null,
  pickupDropoff: boolean,
  dayRate: number | string,
  overnightRate: number | string
): string {
  const nights = nightsBetween(dropOff, pickUp);
  if (nights === null) return "";
  const parts: string[] = [];
  if (nights === 0) parts.push(`Day care × £${dayRate}`);
  else parts.push(`${nights} night${nights > 1 ? "s" : ""} × £${overnightRate}`);
  if (pickupDropoff) parts.push(`pickup/drop-off +£${PICKUP_DROPOFF_FEE}`);
  return parts.join(" · ");
}

export interface BookingRequestInput {
  client: ClientChoice;
  phone: string | null;
  dog: DogChoice;
  notes: string;
  dayRate: number;
  overnightRate: number;
  entries: BookingDraft[];
}

function clientRef(client: ClientChoice, phone: string | null): CreateBookingRequest["client"] {
  if (client.kind === "existing") return { id: client.client.id };
  const name = client.name.trim();
  return phone ? { name, phone } : { name };
}

function dogRef(dog: DogChoice): CreateBookingRequest["dog"] {
  return dog.kind === "existing" ? { id: dog.dog.id } : { name: dog.name.trim() };
}

function toStayRequest(entry: BookingDraft, dayRate: number, overnightRate: number): StayRequest {
  const { dropOff, pickUp } = entry;
  if (!dropOff || !pickUp) throw new Error("Validate the form before building the request");
  return {
    dropOffDate: dropOff.format("YYYY-MM-DD"),
    dropOffTime: entry.timesTbd ? null : dropOff.format("HH:mm"),
    pickUpDate: pickUp.format("YYYY-MM-DD"),
    pickUpTime: entry.timesTbd ? null : pickUp.format("HH:mm"),
    unitRate: dropOff.isSame(pickUp, "day") ? dayRate : overnightRate,
    pickupDropoffFee: entry.pickupDropoff ? PICKUP_DROPOFF_FEE : 0,
  };
}

export function buildCreateRequest(input: BookingRequestInput): CreateBookingRequest {
  const notes = input.notes.trim();
  return {
    client: clientRef(input.client, input.phone),
    dog: dogRef(input.dog),
    notes: notes || null,
    stays: input.entries.map((entry) => toStayRequest(entry, input.dayRate, input.overnightRate)),
  };
}

export interface MappedErrors {
  shared: SharedFieldErrors;
  entries: Record<number, EntryFieldErrors>;
  stays: string | null;
  unmapped: string[];
}

const SHARED_TARGETS = new Map<string, keyof SharedFieldErrors>([
  ["client", "client"],
  ["client.name", "client"],
  ["client.phone", "phone"],
  ["dog", "dog"],
  ["dog.name", "dog"],
  ["notes", "notes"],
]);

const STAY_TARGETS = new Map<string, keyof EntryFieldErrors>([
  ["dropOffDate", "dropOff"],
  ["dropOffTime", "dropOff"],
  ["pickUpDate", "pickUp"],
  ["pickUpTime", "pickUp"],
  ["pickupDropoffFee", "pickupDropoff"],
]);

/** Puts each API field error on the form input it names; anything else goes to `unmapped`. */
export function mapFieldErrors(errors: FieldError[], entries: BookingDraft[]): MappedErrors {
  const mapped: MappedErrors = { shared: {}, entries: {}, stays: null, unmapped: [] };
  for (const { field, message } of errors) {
    const stayField = /^stays\[(\d+)\]\.(\w+)$/.exec(field);
    const entry = stayField ? entries[Number(stayField[1])] : undefined;
    const stayProperty = stayField ? stayField[2] : undefined;
    const sharedTarget = SHARED_TARGETS.get(field);
    const stayTarget = stayProperty ? STAY_TARGETS.get(stayProperty) : undefined;
    if (sharedTarget) {
      mapped.shared[sharedTarget] = message;
    } else if (field === "stays") {
      mapped.stays = message;
    } else if (entry && stayProperty === "unitRate") {
      const rate = deriveService(entry.dropOff, entry.pickUp) === "day_care" ? "dayRate" : "overnightRate";
      mapped.shared[rate] = message;
    } else if (entry && stayTarget) {
      mapped.entries[entry.id] = { ...mapped.entries[entry.id], [stayTarget]: message };
    } else {
      mapped.unmapped.push(`${field}: ${message}`);
    }
  }
  return mapped;
}

function formatDateTime(date: string, time: string | null): string {
  if (!time) return dayjs(date).format("ddd, D MMM YYYY");
  return dayjs(`${date}T${time}`).format("ddd, D MMM YYYY [at] h:mm A");
}

/** A day's date and time for display; "(time TBD)" when the time isn't set. */
export function fmt(date: string, time: string | null): string {
  return time ? formatDateTime(date, time) : `${formatDateTime(date, null)} (time TBD)`;
}

export function generateWhatsAppMessage(booking: Booking): string {
  const { stays } = booking;
  const ownerName = booking.client.name;
  const dogName = booking.dog.name;
  const lines = [
    `Hi ${ownerName}! 🐾`,
    "",
    stays.length > 1 ? `Your ${stays.length} bookings are confirmed:` : "Your booking is confirmed:",
    `🐕 Dog: ${dogName}`,
    "",
  ];
  stays.forEach((stay, i) => {
    const service = SERVICE_LABEL[stay.service];
    if (stays.length > 1) lines.push(`— Booking ${i + 1} (${service}) —`);
    else lines.push(`📋 Service: ${service}`);
    lines.push(
      `📅 Drop-off: ${fmt(stay.dropOffDate, stay.dropOffTime)}`,
      `📅 Pick-up: ${fmt(stay.pickUpDate, stay.pickUpTime)}`,
      `💷 Price: £${stay.price.toFixed(2)}`
    );
    if (stay.pickupDropoffFee > 0) lines.push("🚗 Pickup & drop-off service: included");
    if (!stay.dropOffTime || !stay.pickUpTime) lines.push("⏰ Will confirm the exact time closer to the date");
    lines.push("");
  });
  if (booking.notes) lines.push(`📝 Notes: ${booking.notes}`, "");
  if (stays.length > 1) lines.push(`💷 Total: £${booking.total.toFixed(2)}`, "");
  lines.push(`We look forward to looking after ${dogName}! 🐶`);
  return lines.join("\n");
}

export function generateWhatsAppLink(msg: string): string {
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

interface EventDates {
  allDay: boolean;
  start: string;
  end: string;
}

function eventDates(stay: Stay): EventDates {
  const { dropOffDate, dropOffTime, pickUpDate, pickUpTime } = stay;
  if (dropOffTime && pickUpTime) {
    return {
      allDay: false,
      start: dayjs(`${dropOffDate}T${dropOffTime}`).format("YYYYMMDDTHHmm00"),
      end: dayjs(`${pickUpDate}T${pickUpTime}`).format("YYYYMMDDTHHmm00"),
    };
  }
  return {
    allDay: true,
    start: dayjs(dropOffDate).format("YYYYMMDD"),
    end: dayjs(pickUpDate).add(1, "day").format("YYYYMMDD"),
  };
}

function calendarTitle(booking: Booking, stay: Stay): string {
  return `Dog Sitting – ${booking.dog.name} (${SERVICE_LABEL[stay.service]})`;
}

export function generateGCalLink(booking: Booking, stay: Stay): string {
  const { allDay, start, end } = eventDates(stay);
  const details = [
    `Owner: ${booking.client.name}`,
    `Price: £${stay.price.toFixed(2)}`,
    allDay ? "Times to be confirmed" : "",
    booking.notes ? `Notes: ${booking.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(calendarTitle(booking, stay))}` +
    `&dates=${start}/${end}` +
    `&details=${encodeURIComponent(details)}`
  );
}

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildICS(booking: Booking, stay: Stay, now: Dayjs = dayjs()): string {
  const { allDay, start, end } = eventDates(stay);
  const description = [
    `Owner: ${booking.client.name}`,
    `Price: £${stay.price.toFixed(2)}`,
    booking.notes ? `Notes: ${booking.notes}` : "",
  ]
    .filter(Boolean)
    .map(icsText)
    .join("\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dog Sitting Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:stay-${stay.id}@dogsitting.app`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${icsText(calendarTitle(booking, stay))}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadICS(booking: Booking, stay: Stay): void {
  const blob = new Blob([buildICS(booking, stay)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${booking.dog.name.toLowerCase().replace(/\s+/g, "-")}-sitting.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
