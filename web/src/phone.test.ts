import { describe, expect, it } from 'vitest'
import { toE164 } from './phone.ts'

describe('toE164', () => {
  it('turns a UK mobile starting 07 into +447', () => {
    expect(toE164('07700 900123')).toBe('+447700900123')
  })

  it('adds the + to a number starting 447', () => {
    expect(toE164('447700900123')).toBe('+447700900123')
  })

  it('keeps an international number, removing spaces, dashes and brackets', () => {
    expect(toE164('+1 415 555 0100')).toBe('+14155550100')
    expect(toE164('+1 (415) 555-0100')).toBe('+14155550100')
  })

  it('drops the trunk 0 after +44 and turns a leading 00 into +', () => {
    expect(toE164('+44 (0)7700 900123')).toBe('+447700900123')
    expect(toE164('0044 7700 900123')).toBe('+447700900123')
  })

  it.each(['hello', '0770', '020 7946 0000', '+0123456789', '07700 9001234', '0770090012', ''])('rejects %s', (input) => {
    expect(toE164(input)).toBeNull()
  })
})
