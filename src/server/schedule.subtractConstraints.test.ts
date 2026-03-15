import { describe, it, expect } from 'vitest'
import { subtractConstraints, type ConstraintInfo } from './schedule'

describe('subtractConstraints', () => {
  const shift = (start: string, end: string) => ({ start, end })

  // ---------------------------------------------------------------------------
  // Non-recurring constraints (daysOfWeek = null)
  // ---------------------------------------------------------------------------

  describe('non-recurring constraints', () => {
    it('no constraints returns full shift', () => {
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', [],
      )
      expect(result).toEqual([shift('2026-03-15T07:00:00', '2026-03-16T07:00:00')])
    })

    it('constraint fully covering shift returns empty', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-15T00:00:00',
        endDatetime: '2026-03-17T00:00:00',
        daysOfWeek: null,
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([])
    })

    it('constraint overlapping start trims the beginning', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-15T05:00:00',
        endDatetime: '2026-03-15T10:00:00',
        daysOfWeek: null,
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([shift('2026-03-15T10:00:00', '2026-03-16T07:00:00')])
    })

    it('constraint overlapping end trims the end', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-15T20:00:00',
        endDatetime: '2026-03-16T10:00:00',
        daysOfWeek: null,
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([shift('2026-03-15T07:00:00', '2026-03-15T20:00:00')])
    })

    it('constraint in the middle punches a hole (two intervals)', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-15T12:00:00',
        endDatetime: '2026-03-15T14:00:00',
        daysOfWeek: null,
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([
        shift('2026-03-15T07:00:00', '2026-03-15T12:00:00'),
        shift('2026-03-15T14:00:00', '2026-03-16T07:00:00'),
      ])
    })

    it('constraint entirely outside shift is ignored', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-14T00:00:00',
        endDatetime: '2026-03-14T06:00:00',
        daysOfWeek: null,
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([shift('2026-03-15T07:00:00', '2026-03-16T07:00:00')])
    })

    it('multiple constraints subtract independently', () => {
      const constraints: ConstraintInfo[] = [
        { startDatetime: '2026-03-15T09:00:00', endDatetime: '2026-03-15T10:00:00', daysOfWeek: null },
        { startDatetime: '2026-03-15T14:00:00', endDatetime: '2026-03-15T15:00:00', daysOfWeek: null },
      ]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-15T18:00:00', constraints,
      )
      expect(result).toEqual([
        shift('2026-03-15T07:00:00', '2026-03-15T09:00:00'),
        shift('2026-03-15T10:00:00', '2026-03-15T14:00:00'),
        shift('2026-03-15T15:00:00', '2026-03-15T18:00:00'),
      ])
    })
  })

  // ---------------------------------------------------------------------------
  // Recurring constraints (daysOfWeek is an array)
  // ---------------------------------------------------------------------------

  describe('recurring constraints', () => {
    it('day-of-week matches: subtracts the time window', () => {
      // 2026-03-15 is a Sunday (day 0)
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-01T12:00:00',
        endDatetime: '2026-03-31T14:00:00',
        daysOfWeek: [0], // Sunday
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([
        shift('2026-03-15T07:00:00', '2026-03-15T12:00:00'),
        shift('2026-03-15T14:00:00', '2026-03-16T07:00:00'),
      ])
    })

    it('day-of-week does not match: constraint ignored', () => {
      // 2026-03-15 is Sunday (day 0), constraint is for Monday (day 1)
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-01T12:00:00',
        endDatetime: '2026-03-31T14:00:00',
        daysOfWeek: [1], // Monday
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([shift('2026-03-15T07:00:00', '2026-03-16T07:00:00')])
    })

    it('shift date before constraint range: ignored', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-04-01T12:00:00',
        endDatetime: '2026-04-30T14:00:00',
        daysOfWeek: [0],
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([shift('2026-03-15T07:00:00', '2026-03-16T07:00:00')])
    })

    it('shift date after constraint range: ignored', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-02-01T12:00:00',
        endDatetime: '2026-02-28T14:00:00',
        daysOfWeek: [0],
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-16T07:00:00', constraints,
      )
      expect(result).toEqual([shift('2026-03-15T07:00:00', '2026-03-16T07:00:00')])
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('blockStart equals interval end (no overlap)', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-15T18:00:00',
        endDatetime: '2026-03-15T20:00:00',
        daysOfWeek: null,
      }]
      // Shift ends exactly when block starts
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-15T18:00:00', constraints,
      )
      expect(result).toEqual([shift('2026-03-15T07:00:00', '2026-03-15T18:00:00')])
    })

    it('blockEnd equals interval start (no overlap)', () => {
      const constraints: ConstraintInfo[] = [{
        startDatetime: '2026-03-15T05:00:00',
        endDatetime: '2026-03-15T07:00:00',
        daysOfWeek: null,
      }]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-15T18:00:00', constraints,
      )
      expect(result).toEqual([shift('2026-03-15T07:00:00', '2026-03-15T18:00:00')])
    })

    it('constraints that fully block all sub-intervals return empty', () => {
      const constraints: ConstraintInfo[] = [
        { startDatetime: '2026-03-15T07:00:00', endDatetime: '2026-03-15T12:00:00', daysOfWeek: null },
        { startDatetime: '2026-03-15T12:00:00', endDatetime: '2026-03-15T18:00:00', daysOfWeek: null },
      ]
      const result = subtractConstraints(
        '2026-03-15T07:00:00', '2026-03-15T18:00:00', constraints,
      )
      expect(result).toEqual([])
    })
  })
})
