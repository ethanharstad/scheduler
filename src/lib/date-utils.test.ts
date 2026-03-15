import { describe, it, expect } from 'vitest'
import { getDatesInRange, addDays, formatDuration } from './date-utils'

describe('getDatesInRange', () => {
  it('single day range returns one date', () => {
    expect(getDatesInRange('2026-03-15', '2026-03-15')).toEqual(['2026-03-15'])
  })

  it('multi-day range returns correct sequence', () => {
    expect(getDatesInRange('2026-03-13', '2026-03-15')).toEqual([
      '2026-03-13', '2026-03-14', '2026-03-15',
    ])
  })

  it('handles month boundary crossing', () => {
    const result = getDatesInRange('2026-01-30', '2026-02-02')
    expect(result).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
  })

  it('returns empty array when start > end', () => {
    expect(getDatesInRange('2026-03-15', '2026-03-10')).toEqual([])
  })
})

describe('addDays', () => {
  it('add 0 returns same date', () => {
    expect(addDays('2026-03-15', 0)).toBe('2026-03-15')
  })

  it('add positive days', () => {
    expect(addDays('2026-03-15', 5)).toBe('2026-03-20')
  })

  it('add negative days', () => {
    expect(addDays('2026-03-15', -5)).toBe('2026-03-10')
  })

  it('crosses month boundary', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02')
  })

  it('crosses year boundary', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04')
  })
})

describe('formatDuration', () => {
  it('exact hours shows no minutes', () => {
    expect(formatDuration('2026-03-15T08:00:00', '2026-03-15T10:00:00')).toBe('2h')
  })

  it('hours and minutes', () => {
    expect(formatDuration('2026-03-15T08:00:00', '2026-03-15T10:30:00')).toBe('2h 30m')
  })

  it('24 hours', () => {
    expect(formatDuration('2026-03-15T07:00:00', '2026-03-16T07:00:00')).toBe('24h')
  })
})
