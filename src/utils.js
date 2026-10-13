import dayjs from "dayjs";

export function deriveService(dropOff, pickUp) {
  if (
    !dropOff ||
    !pickUp ||
    !dayjs(dropOff).isValid() ||
    !dayjs(pickUp).isValid()
  )
    return "";
  const nights = dayjs(pickUp)
    .startOf("day")
    .diff(dayjs(dropOff).startOf("day"), "day");
  if (nights < 0) return "";
  return nights === 0 ? "Day Care" : "Boarding";
}

export function calcPrice(
  dropOff,
  pickUp,
  pickupDropoff,
  dayRate,
  overnightRate
) {
  if (
    !dropOff ||
    !pickUp ||
    !dayjs(dropOff).isValid() ||
    !dayjs(pickUp).isValid()
  )
    return null;
  const nights = dayjs(pickUp)
    .startOf("day")
    .diff(dayjs(dropOff).startOf("day"), "day");
  if (nights < 0) return null;
  const base = nights === 0 ? dayRate : nights * overnightRate;
  return base + (pickupDropoff ? 15 : 0);
}

export function priceBreakdown(
  dropOff,
  pickUp,
  pickupDropoff,
  dayRate,
  overnightRate
) {
  if (
    !dropOff ||
    !pickUp ||
    !dayjs(dropOff).isValid() ||
    !dayjs(pickUp).isValid()
  )
    return "";
  const nights = dayjs(pickUp)
    .startOf("day")
    .diff(dayjs(dropOff).startOf("day"), "day");
  if (nights < 0) return "";
  const parts = [];
  if (nights === 0) parts.push(`Day care × £${dayRate}`);
  else
    parts.push(`${nights} night${nights > 1 ? "s" : ""} × £${overnightRate}`);
  if (pickupDropoff) parts.push("pickup/drop-off +£15");
  return parts.join(" · ");
}

export function formatDateTime(iso, timeTbd = false) {
  if (timeTbd) return dayjs(iso).format("ddd, D MMM YYYY");
  return dayjs(iso).format("ddd, D MMM YYYY [at] h:mm A");
}

export function generateWhatsAppMessage(booking) {
  const tbd = booking.timesTbd;
  const lines = [
    `Hi ${booking.ownerName}! 🐾`,
    "",
    "Your booking is confirmed:",
    `🐕 Dog: ${booking.dogName}`,
    `📋 Service: ${booking.service}`,
    `📅 Drop-off: ${formatDateTime(booking.dropOff, tbd)}${
      tbd ? " (time TBD)" : ""
    }`,
    `📅 Pick-up: ${formatDateTime(booking.pickUp, tbd)}${
      tbd ? " (time TBD)" : ""
    }`,
    `💷 Price: £${parseFloat(booking.price).toFixed(2)}`,
  ];
  if (booking.pickupDropoff)
    lines.push(`🚗 Pickup & drop-off service: included`);
  if (booking.notes) lines.push(`📝 Notes: ${booking.notes}`);
  if (booking.timesTbd)
    lines.push(
      `\n⏰ We will confirm the pickup/dropoff time closer to the booking date`
    );
  lines.push("", `We look forward to looking after ${booking.dogName}! 🐶`);
  return lines.join("\n");
}

export function generateGCalLink(booking) {
  const title = `Dog Sitting – ${booking.dogName} (${booking.service})`;
  let start, end;
  if (booking.timesTbd) {
    start = dayjs(booking.dropOff).format("YYYYMMDD");
    end = dayjs(booking.pickUp).add(1, "day").format("YYYYMMDD");
  } else {
    start = dayjs(booking.dropOff).format("YYYYMMDDTHHmm00");
    end = dayjs(booking.pickUp).format("YYYYMMDDTHHmm00");
  }
  const details = [
    `Owner: ${booking.ownerName}`,
    `Price: £${parseFloat(booking.price).toFixed(2)}`,
    booking.timesTbd ? "Times to be confirmed" : "",
    booking.notes ? `Notes: ${booking.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${start}/${end}` +
    `&details=${encodeURIComponent(details)}`
  );
}

export function generateWhatsAppLink(msg) {
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export function generateWhatsAppMessageMulti(bookings) {
  if (!bookings.length) return "";
  const { dogName, ownerName } = bookings[0];
  const lines = [
    `Hi ${ownerName}! 🐾`,
    "",
    bookings.length > 1
      ? `Your ${bookings.length} bookings are confirmed:`
      : "Your booking is confirmed:",
    `🐕 Dog: ${dogName}`,
    "",
  ];
  bookings.forEach((b, i) => {
    if (bookings.length > 1) lines.push(`— Booking ${i + 1} (${b.service}) —`);
    else lines.push(`📋 Service: ${b.service}`);
    lines.push(
      `📅 Drop-off: ${formatDateTime(b.dropOff, b.timesTbd)}${
        b.timesTbd ? " (time TBD)" : ""
      }`,
      `📅 Pick-up: ${formatDateTime(b.pickUp, b.timesTbd)}${
        b.timesTbd ? " (time TBD)" : ""
      }`,
      `💷 Price: £${parseFloat(b.price).toFixed(2)}`
    );
    if (b.pickupDropoff) lines.push("🚗 Pickup & drop-off service: included");
    if (b.notes) lines.push(`📝 Notes: ${b.notes}`);
    if (b.timesTbd)
      lines.push("⏰ Will confirm the exact time closer to the date");
    lines.push("");
  });
  if (bookings.length > 1) {
    const total = bookings.reduce((sum, b) => sum + parseFloat(b.price), 0);
    lines.push(`💷 Total: £${total.toFixed(2)}`, "");
  }
  lines.push(`We look forward to looking after ${dogName}! 🐶`);
  return lines.join("\n");
}

export function fmt(iso, timeTbd = false) {
  if (timeTbd) return `${dayjs(iso).format("ddd, D MMM YYYY")} (time TBD)`;
  return dayjs(iso).format("ddd, D MMM YYYY [at] h:mm A");
}

export function downloadICS(booking) {
  const title = `Dog Sitting – ${booking.dogName} (${booking.service})`;
  const description = [
    `Owner: ${booking.ownerName}`,
    `Price: £${parseFloat(booking.price).toFixed(2)}`,
    booking.notes ? `Notes: ${booking.notes}` : "",
  ]
    .filter(Boolean)
    .join("\\n");
  const stamp = dayjs().format("YYYYMMDDTHHmm00");
  let dtStart, dtEnd;
  if (booking.timesTbd) {
    dtStart = `DTSTART;VALUE=DATE:${dayjs(booking.dropOff).format("YYYYMMDD")}`;
    dtEnd = `DTEND;VALUE=DATE:${dayjs(booking.pickUp)
      .add(1, "day")
      .format("YYYYMMDD")}`;
  } else {
    dtStart = `DTSTART:${dayjs(booking.dropOff).format("YYYYMMDDTHHmm00")}`;
    dtEnd = `DTEND:${dayjs(booking.pickUp).format("YYYYMMDDTHHmm00")}`;
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dog Sitting Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@dogsitting.app`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${booking.dogName
    .toLowerCase()
    .replace(/\s+/g, "-")}-sitting.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
