import { describe, it, expect } from 'vitest'
import {
  parseRRule,
  isValidRRuleString,
  validateInspectionRRule,
  describeRRule,
  rruleToIntervalDays,
  nthWeekdayInMonth,
  computeNextDue,
} from './rrule'

// ---------------------------------------------------------------------------
// parseRRule
// ---------------------------------------------------------------------------

describe('parseRRule', () => {
  it('parses FREQ=DAILY with default interval', () => {
    const r = parseRRule('FREQ=DAILY')
    expect(r).toEqual({ freq: 'DAILY', interval: 1, byDay: undefined, byMonthDay: undefined })
  })

  it('parses FREQ=WEEKLY with interval and BYDAY', () => {
    const r = parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')
    expect(r).toEqual({ freq: 'WEEKLY', interval: 2, byDay: 'MO', byMonthDay: undefined })
  })

  it('parses FREQ=MONTHLY with BYMONTHDAY', () => {
    const r = parseRRule('FREQ=MONTHLY;BYMONTHDAY=15')
    expect(r).toEqual({ freq: 'MONTHLY', interval: 1, byDay: undefined, byMonthDay: 15 })
  })

  it('parses FREQ=MONTHLY with ordinal BYDAY', () => {
    const r = parseRRule('FREQ=MONTHLY;BYDAY=2TU')
    expect(r).toEqual({ freq: 'MONTHLY', interval: 1, byDay: '2TU', byMonthDay: undefined })
  })

  it('parses FREQ=YEARLY with INTERVAL', () => {
    const r = parseRRule('FREQ=YEARLY;INTERVAL=3')
    expect(r).toEqual({ freq: 'YEARLY', interval: 3, byDay: undefined, byMonthDay: undefined })
  })

  it('strips RRULE: prefix (case-insensitive)', () => {
    const r = parseRRule('rrule:FREQ=DAILY;INTERVAL=5')
    expect(r.freq).toBe('DAILY')
    expect(r.interval).toBe(5)
  })

  it('throws on missing FREQ', () => {
    expect(() => parseRRule('INTERVAL=2')).toThrow()
  })

  it('throws on unsupported FREQ', () => {
    expect(() => parseRRule('FREQ=HOURLY')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// isValidRRuleString
// ---------------------------------------------------------------------------

describe('isValidRRuleString', () => {
  it('accepts valid DAILY string', () => {
    expect(isValidRRuleString('FREQ=DAILY')).toBe(true)
  })

  it('accepts valid WEEKLY string with multiple parts', () => {
    expect(isValidRRuleString('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR')).toBe(true)
  })

  it('accepts RRULE: prefixed string', () => {
    expect(isValidRRuleString('RRULE:FREQ=MONTHLY;BYMONTHDAY=1')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidRRuleString('')).toBe(false)
  })

  it('rejects string without FREQ', () => {
    expect(isValidRRuleString('INTERVAL=2;BYDAY=MO')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateInspectionRRule
// ---------------------------------------------------------------------------

describe('validateInspectionRRule', () => {
  // DAILY
  it('accepts DAILY without BYDAY', () => {
    expect(validateInspectionRRule('FREQ=DAILY;INTERVAL=7')).toBe(true)
  })

  it('rejects DAILY with BYDAY', () => {
    expect(validateInspectionRRule('FREQ=DAILY;BYDAY=MO')).toBe(false)
  })

  // WEEKLY
  it('accepts WEEKLY with valid BYDAY', () => {
    expect(validateInspectionRRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO')).toBe(true)
  })

  it('rejects WEEKLY without BYDAY', () => {
    expect(validateInspectionRRule('FREQ=WEEKLY;INTERVAL=1')).toBe(false)
  })

  // MONTHLY
  it('accepts MONTHLY with BYMONTHDAY 1-28', () => {
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')).toBe(true)
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1')).toBe(true)
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28')).toBe(true)
  })

  it('rejects MONTHLY with BYMONTHDAY > 28', () => {
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=29')).toBe(false)
  })

  it('accepts MONTHLY with ordinal BYDAY', () => {
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYDAY=1MO')).toBe(true)
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYDAY=4SU')).toBe(true)
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR')).toBe(true)
  })

  it('rejects MONTHLY with invalid ordinal BYDAY', () => {
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYDAY=5MO')).toBe(false)
    expect(validateInspectionRRule('FREQ=MONTHLY;INTERVAL=1;BYDAY=0TU')).toBe(false)
  })

  it('rejects MONTHLY with both BYMONTHDAY and BYDAY', () => {
    expect(validateInspectionRRule('FREQ=MONTHLY;BYMONTHDAY=1;BYDAY=1MO')).toBe(false)
  })

  // YEARLY
  it('accepts plain YEARLY', () => {
    expect(validateInspectionRRule('FREQ=YEARLY;INTERVAL=1')).toBe(true)
  })

  it('accepts YEARLY with BYMONTHDAY', () => {
    expect(validateInspectionRRule('FREQ=YEARLY;BYMONTHDAY=15')).toBe(true)
  })

  it('accepts YEARLY with BYDAY', () => {
    expect(validateInspectionRRule('FREQ=YEARLY;BYDAY=2TU')).toBe(true)
  })

  it('returns false on malformed input', () => {
    expect(validateInspectionRRule('garbage')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// describeRRule
// ---------------------------------------------------------------------------

describe('describeRRule', () => {
  it('DAILY interval 1 → "Daily"', () => {
    expect(describeRRule('FREQ=DAILY')).toBe('Daily')
  })

  it('DAILY interval 3 → "Every 3 days"', () => {
    expect(describeRRule('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days')
  })

  it('WEEKLY interval 1 with BYDAY=MO → "Weekly on Monday"', () => {
    expect(describeRRule('FREQ=WEEKLY;BYDAY=MO')).toBe('Weekly on Monday')
  })

  it('WEEKLY interval 2 with BYDAY=FR → "Every 2 weeks on Friday"', () => {
    expect(describeRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR')).toBe('Every 2 weeks on Friday')
  })

  it('MONTHLY with BYMONTHDAY=15 → "Monthly on the 15th"', () => {
    expect(describeRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('Monthly on the 15th')
  })

  it('MONTHLY interval 3 → "Quarterly..."', () => {
    expect(describeRRule('FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1')).toBe('Quarterly on the 1st')
  })

  it('MONTHLY interval 6 → "Semi-annually..."', () => {
    expect(describeRRule('FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=1')).toBe('Semi-annually on the 1st')
  })

  it('MONTHLY with BYDAY=2TU → "Monthly on the 2nd Tuesday"', () => {
    expect(describeRRule('FREQ=MONTHLY;BYDAY=2TU')).toBe('Monthly on the 2nd Tuesday')
  })

  it('MONTHLY with BYDAY=-1FR → "Monthly on the last Friday"', () => {
    expect(describeRRule('FREQ=MONTHLY;BYDAY=-1FR')).toBe('Monthly on the last Friday')
  })

  it('YEARLY interval 1 → "Annually"', () => {
    expect(describeRRule('FREQ=YEARLY')).toBe('Annually')
  })

  it('YEARLY interval 2 → "Every 2 years"', () => {
    expect(describeRRule('FREQ=YEARLY;INTERVAL=2')).toBe('Every 2 years')
  })

  it('returns raw string on parse failure', () => {
    expect(describeRRule('garbage')).toBe('garbage')
  })
})

// ---------------------------------------------------------------------------
// rruleToIntervalDays
// ---------------------------------------------------------------------------

describe('rruleToIntervalDays', () => {
  it('DAILY interval 1 → 1', () => {
    expect(rruleToIntervalDays('FREQ=DAILY')).toBe(1)
  })

  it('DAILY interval 14 → 14', () => {
    expect(rruleToIntervalDays('FREQ=DAILY;INTERVAL=14')).toBe(14)
  })

  it('WEEKLY interval 2 → 14', () => {
    expect(rruleToIntervalDays('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe(14)
  })

  it('MONTHLY interval 1 → 30', () => {
    expect(rruleToIntervalDays('FREQ=MONTHLY;BYMONTHDAY=1')).toBe(30)
  })

  it('YEARLY interval 1 → 365', () => {
    expect(rruleToIntervalDays('FREQ=YEARLY')).toBe(365)
  })

  it('returns 30 on parse failure', () => {
    expect(rruleToIntervalDays('garbage')).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// nthWeekdayInMonth
// ---------------------------------------------------------------------------

describe('nthWeekdayInMonth', () => {
  it('1st Monday of January 2026', () => {
    // January 2026: 1st is Thursday, so 1st Monday is the 5th
    const d = nthWeekdayInMonth(2026, 0, 1, 1)
    expect(d.toISOString().slice(0, 10)).toBe('2026-01-05')
  })

  it('2nd Tuesday of March 2026', () => {
    // March 2026: 1st is Sunday, 1st Tue=3rd, 2nd Tue=10th
    const d = nthWeekdayInMonth(2026, 2, 2, 2)
    expect(d.toISOString().slice(0, 10)).toBe('2026-03-10')
  })

  it('4th Friday of January 2026', () => {
    // January 2026: 1st Fri=2nd, 4th Fri=23rd
    const d = nthWeekdayInMonth(2026, 0, 5, 4)
    expect(d.toISOString().slice(0, 10)).toBe('2026-01-23')
  })

  it('last Friday of February 2026 (non-leap)', () => {
    // Feb 2026: 28 days, last day is Saturday the 28th, so last Friday is 27th
    const d = nthWeekdayInMonth(2026, 1, 5, -1)
    expect(d.toISOString().slice(0, 10)).toBe('2026-02-27')
  })

  it('last Friday of February 2028 (leap year)', () => {
    // Feb 2028: 29 days, Feb 29 is Tuesday, so last Friday is 25th
    const d = nthWeekdayInMonth(2028, 1, 5, -1)
    expect(d.toISOString().slice(0, 10)).toBe('2028-02-25')
  })

  it('last Sunday of March 2026', () => {
    // March 2026: 31 days, March 31 is Tuesday, last Sunday is 29th
    const d = nthWeekdayInMonth(2026, 2, 0, -1)
    expect(d.toISOString().slice(0, 10)).toBe('2026-03-29')
  })
})

// ---------------------------------------------------------------------------
// computeNextDue
// ---------------------------------------------------------------------------

describe('computeNextDue', () => {
  // DAILY
  it('DAILY advance=false returns base date', () => {
    expect(computeNextDue('2026-03-15', 'FREQ=DAILY;INTERVAL=7', false)).toBe('2026-03-15')
  })

  it('DAILY advance=true adds interval days', () => {
    expect(computeNextDue('2026-03-15', 'FREQ=DAILY;INTERVAL=7', true)).toBe('2026-03-22')
  })

  // WEEKLY
  it('WEEKLY advance=false finds next target day after base', () => {
    // Base: Sunday 2026-03-15, target: Friday (default when no BYDAY)
    // Next Friday after Sunday March 15 = March 20
    const result = computeNextDue('2026-03-15', 'FREQ=WEEKLY;INTERVAL=1', false)
    expect(result).toBe('2026-03-20')
  })

  it('WEEKLY advance=true skips forward by interval weeks', () => {
    // Base: 2026-03-15 (Sunday), target: Monday, interval 2
    // anchor = base + (2-1)*7 = base + 7 = March 22 (Sunday)
    // next Monday after March 22 = March 23
    const result = computeNextDue('2026-03-15', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', true)
    expect(result).toBe('2026-03-23')
  })

  // MONTHLY / BYMONTHDAY
  it('MONTHLY BYMONTHDAY advance=false returns current month if future', () => {
    // Base: 2026-03-10, BYMONTHDAY=15, 15th is in the future → 2026-03-15
    expect(computeNextDue('2026-03-10', 'FREQ=MONTHLY;BYMONTHDAY=15', false)).toBe('2026-03-15')
  })

  it('MONTHLY BYMONTHDAY advance=false returns next interval month if past', () => {
    // Base: 2026-03-20, BYMONTHDAY=15, 15th is past → next month (April 15)
    expect(computeNextDue('2026-03-20', 'FREQ=MONTHLY;BYMONTHDAY=15', false)).toBe('2026-04-15')
  })

  it('MONTHLY BYMONTHDAY advance=true goes forward by interval', () => {
    // Base: 2026-03-15, interval=1 → April 15
    expect(computeNextDue('2026-03-15', 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15', true)).toBe('2026-04-15')
  })

  // MONTHLY / BYDAY
  it('MONTHLY BYDAY with ordinal weekday', () => {
    // Base: 2026-03-01, 2nd Tuesday, advance=false
    // 2nd Tuesday of March 2026 = March 10 (future from March 1) → 2026-03-10
    expect(computeNextDue('2026-03-01', 'FREQ=MONTHLY;BYDAY=2TU', false)).toBe('2026-03-10')
  })

  it('MONTHLY BYDAY advance=true goes to next interval month', () => {
    // Base: 2026-03-10, 2nd Tuesday, interval=1
    // Next month April: 2nd Tuesday of April 2026 = April 14
    expect(computeNextDue('2026-03-10', 'FREQ=MONTHLY;BYDAY=2TU', true)).toBe('2026-04-14')
  })

  // YEARLY
  it('YEARLY plain advances by interval years', () => {
    expect(computeNextDue('2026-03-15', 'FREQ=YEARLY', true)).toBe('2027-03-15')
  })

  it('YEARLY with BYMONTHDAY', () => {
    expect(computeNextDue('2026-03-15', 'FREQ=YEARLY;BYMONTHDAY=20', false)).toBe('2026-03-20')
  })

  it('YEARLY with BYDAY', () => {
    // Base: 2026-03-01, 1st Monday, advance=true
    // 1st Monday of March 2027: March 1 2027 is Monday → 2027-03-01
    expect(computeNextDue('2026-03-01', 'FREQ=YEARLY;BYDAY=1MO', true)).toBe('2027-03-01')
  })

  // Month overflow
  it('handles month overflow (wraps to next year)', () => {
    // Base: 2026-11-15, MONTHLY interval=2, BYMONTHDAY=15
    // advance=true → month 11+2=13 → wraps to January next year
    expect(computeNextDue('2026-11-15', 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15', true)).toBe('2027-01-15')
  })
})
