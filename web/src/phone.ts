const UK_MOBILE = /^\+447\d{9}$/
const E164 = /^\+[1-9][0-9]{7,14}$/

export const PHONE_ERROR = 'Enter a UK mobile or international number'

/** What was typed, as E.164 (e.g. +447700900123), or null if it can't be one. */
export function toE164(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, '')
  let candidate = cleaned
  if (cleaned.startsWith('07')) candidate = `+44${cleaned.slice(1)}`
  else if (cleaned.startsWith('447')) candidate = `+${cleaned}`
  else if (cleaned.startsWith('00')) candidate = `+${cleaned.slice(2)}`
  if (candidate.startsWith('+440')) candidate = `+44${candidate.slice(4)}`
  if (candidate.startsWith('+447')) return UK_MOBILE.test(candidate) ? candidate : null
  return E164.test(candidate) ? candidate : null
}
