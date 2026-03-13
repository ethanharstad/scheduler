// ---------------------------------------------------------------------------
// Shared RRULE utilities — used by asset inspection schedules and platoon management
// ---------------------------------------------------------------------------

export interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number    // default 1
  byDay?: string      // e.g. "MO", "FR", "1MO", "-1FR"
  byMonthDay?: number // 1-28
}

// Syntactic validation — accepts any RFC5545 RRULE string
export function isValidRRuleString(rrule: string): boolean {
  const stripped = rrule.replace(/^RRULE:/i, '').trim()
  if (!/\bFREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)\b/.test(stripped)) return false
  if (!/^[A-Z]+=[^\s;]+(;[A-Z]+=[^\s;]+)*$/.test(stripped)) return false
  return true
}

// Stricter validation: only the subset that inspection schedules support
// Accepted patterns:
//   FREQ=DAILY;INTERVAL=N
//   FREQ=WEEKLY;INTERVAL=N;BYDAY=XX        (XX = MO|TU|WE|TH|FR|SA|SU)
//   FREQ=MONTHLY;INTERVAL=N;BYMONTHDAY=D   (D = 1-28)
//   FREQ=MONTHLY;INTERVAL=N;BYDAY=PXX      (P = 1|2|3|4|-1, XX = day abbrev)
//   FREQ=YEARLY;BYMONTHDAY=D
//   FREQ=YEARLY;BYDAY=PXX
export function validateInspectionRRule(rrule: string): boolean {
  try {
    const rule = parseRRule(rrule)
    const { freq, interval, byDay, byMonthDay } = rule

    if (!Number.isInteger(interval) || interval < 1) return false

    if (freq === 'DAILY') {
      return byDay === undefined && byMonthDay === undefined
    }

    if (freq === 'WEEKLY') {
      return /^(MO|TU|WE|TH|FR|SA|SU)$/.test(byDay ?? '') && byMonthDay === undefined
    }

    if (freq === 'MONTHLY') {
      if (byMonthDay !== undefined && byDay === undefined) {
        return Number.isInteger(byMonthDay) && byMonthDay >= 1 && byMonthDay <= 28
      }
      if (byDay !== undefined && byMonthDay === undefined) {
        return /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/.test(byDay)
      }
      return false
    }

    if (freq === 'YEARLY') {
      // Plain FREQ=YEARLY;INTERVAL=N (no BYMONTHDAY/BYDAY) — most common case
      if (byMonthDay === undefined && byDay === undefined) return true
      if (byMonthDay !== undefined && byDay === undefined) {
        return Number.isInteger(byMonthDay) && byMonthDay >= 1 && byMonthDay <= 28
      }
      if (byDay !== undefined && byMonthDay === undefined) {
        return /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/.test(byDay)
      }
      return false
    }

    return false
  } catch {
    return false
  }
}

export function parseRRule(rrule: string): ParsedRRule {
  const stripped = rrule.replace(/^RRULE:/i, '').trim()
  const parts: Record<string, string> = {}
  for (const part of stripped.split(';')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx > 0) {
      parts[part.slice(0, eqIdx)] = part.slice(eqIdx + 1)
    }
  }

  const freqStr = parts['FREQ']
  if (!freqStr || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freqStr)) {
    throw new Error(`Invalid or unsupported FREQ: ${freqStr}`)
  }
  const freq = freqStr as ParsedRRule['freq']
  const interval = parts['INTERVAL'] ? parseInt(parts['INTERVAL'], 10) : 1
  const byDay = parts['BYDAY']
  const byMonthDay = parts['BYMONTHDAY'] ? parseInt(parts['BYMONTHDAY'], 10) : undefined

  return { freq, interval, byDay, byMonthDay }
}

// Human-readable description for UI display
export function describeRRule(rrule: string): string {
  try {
    const rule = parseRRule(rrule)
    const dayNames: Record<string, string> = {
      MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday',
      FR: 'Friday', SA: 'Saturday', SU: 'Sunday',
    }
    const ordinalLabels: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [-1]: 'last' }
    const ordinal = (n: number) => {
      if (n >= 11 && n <= 13) return `${n}th`
      const s = ['th', 'st', 'nd', 'rd']
      const v = n % 10
      return n + (s[v] ?? 'th')
    }

    if (rule.freq === 'DAILY') {
      return rule.interval === 1 ? 'Daily' : `Every ${rule.interval} days`
    }

    if (rule.freq === 'WEEKLY') {
      const dayName = rule.byDay ? (dayNames[rule.byDay] ?? rule.byDay) : 'Friday'
      return rule.interval === 1 ? `Weekly on ${dayName}` : `Every ${rule.interval} weeks on ${dayName}`
    }

    if (rule.freq === 'MONTHLY') {
      const periodLabel =
        rule.interval === 1 ? 'Monthly' :
        rule.interval === 3 ? 'Quarterly' :
        rule.interval === 6 ? 'Semi-annually' :
        `Every ${rule.interval} months`

      if (rule.byMonthDay !== undefined) {
        return `${periodLabel} on the ${ordinal(rule.byMonthDay)}`
      }
      if (rule.byDay) {
        const m = rule.byDay.match(/^(-?\d+)([A-Z]{2})$/)
        if (m) {
          const pos = parseInt(m[1]!, 10)
          const abbr = m[2]!
          const dayName = dayNames[abbr] ?? abbr
          const posLabel = ordinalLabels[pos] ?? `${pos}th`
          return `${periodLabel} on the ${posLabel} ${dayName}`
        }
      }
      return periodLabel
    }

    if (rule.freq === 'YEARLY') {
      const yearLabel = rule.interval === 1 ? 'Annually' : `Every ${rule.interval} years`
      if (rule.byMonthDay !== undefined) {
        return `${yearLabel} on the ${ordinal(rule.byMonthDay)}`
      }
      if (rule.byDay) {
        const m = rule.byDay.match(/^(-?\d+)([A-Z]{2})$/)
        if (m) {
          const pos = parseInt(m[1]!, 10)
          const abbr = m[2]!
          const dayName = dayNames[abbr] ?? abbr
          const posLabel = ordinalLabels[pos] ?? `${pos}th`
          return `${yearLabel} on the ${posLabel} ${dayName}`
        }
      }
      return yearLabel
    }

    return rrule
  } catch {
    return rrule
  }
}

// Approximate interval in days (for the interval_days DB column)
export function rruleToIntervalDays(rrule: string): number {
  try {
    const rule = parseRRule(rrule)
    if (rule.freq === 'DAILY') return rule.interval
    if (rule.freq === 'WEEKLY') return rule.interval * 7
    if (rule.freq === 'MONTHLY') return rule.interval * 30
    if (rule.freq === 'YEARLY') return rule.interval * 365
    return 30
  } catch {
    return 30
  }
}

// ---------------------------------------------------------------------------
// Internal helpers used by computeNextDue (exported for testability)
// ---------------------------------------------------------------------------

// Returns the Date of the Nth occurrence of a weekday in a given year/month.
// dow: 0=Sun, 1=Mon, ..., 6=Sat  |  pos: 1..4 = Nth, -1 = last
export function nthWeekdayInMonth(year: number, month: number, dow: number, pos: number): Date {
  if (pos > 0) {
    const firstDay = new Date(Date.UTC(year, month, 1))
    const firstDow = firstDay.getUTCDay()
    const diff = (dow - firstDow + 7) % 7
    const dayOfMonth = 1 + diff + (pos - 1) * 7
    return new Date(Date.UTC(year, month, dayOfMonth))
  } else {
    // pos === -1: last occurrence
    const lastDay = new Date(Date.UTC(year, month + 1, 0))
    const lastDow = lastDay.getUTCDay()
    const diff = (lastDow - dow + 7) % 7
    return new Date(Date.UTC(year, month, lastDay.getUTCDate() - diff))
  }
}

const DAY_ABBREV_TO_DOW: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
}

// Parse an ordinal day string like "1MO" → {pos:1, dow:1} or "-1FR" → {pos:-1, dow:5}
// Also handles plain day abbreviation like "FR" → {pos:1, dow:5}
function parseOrdinalDay(byDay: string): { dow: number; pos: number } {
  const m = byDay.match(/^(-?\d+)([A-Z]{2})$/)
  if (m) {
    return { pos: parseInt(m[1]!, 10), dow: DAY_ABBREV_TO_DOW[m[2]!] ?? 5 }
  }
  return { pos: 1, dow: DAY_ABBREV_TO_DOW[byDay] ?? 5 }
}

// Compute the next inspection due date from a base date and RRULE string.
// advance=true  (post-inspection): always go one full period forward
// advance=false (initial setup):   find the soonest upcoming occurrence
export function computeNextDue(base: string, rrule: string, advance: boolean): string {
  const rule = parseRRule(rrule)
  const baseDate = new Date(base + 'T00:00:00Z')

  if (rule.freq === 'DAILY') {
    if (!advance) return base
    return new Date(baseDate.getTime() + rule.interval * 86400000).toISOString().slice(0, 10)
  }

  if (rule.freq === 'WEEKLY') {
    const targetDow = DAY_ABBREV_TO_DOW[rule.byDay ?? 'FR'] ?? 5
    // advance=true: go at least interval*7 days forward, then find next target dow
    // advance=false: find next target dow strictly after base
    const anchorMs = advance
      ? baseDate.getTime() + (rule.interval - 1) * 7 * 86400000
      : baseDate.getTime()
    const anchorDow = new Date(anchorMs).getUTCDay()
    let diff = (targetDow - anchorDow + 7) % 7
    if (diff === 0) diff = 7
    return new Date(anchorMs + diff * 86400000).toISOString().slice(0, 10)
  }

  if (rule.freq === 'MONTHLY') {
    let year = baseDate.getUTCFullYear()
    let month = baseDate.getUTCMonth()

    if (rule.byMonthDay !== undefined) {
      const dom = Math.min(rule.byMonthDay, 28)
      if (!advance) {
        const candidate = new Date(Date.UTC(year, month, dom))
        if (candidate > baseDate) return candidate.toISOString().slice(0, 10)
      }
      month += rule.interval
      year += Math.floor(month / 12)
      month = ((month % 12) + 12) % 12
      return new Date(Date.UTC(year, month, dom)).toISOString().slice(0, 10)
    }

    if (rule.byDay) {
      const { dow, pos } = parseOrdinalDay(rule.byDay)
      if (!advance) {
        const candidate = nthWeekdayInMonth(year, month, dow, pos)
        if (candidate > baseDate) return candidate.toISOString().slice(0, 10)
      }
      month += rule.interval
      year += Math.floor(month / 12)
      month = ((month % 12) + 12) % 12
      return nthWeekdayInMonth(year, month, dow, pos).toISOString().slice(0, 10)
    }
  }

  if (rule.freq === 'YEARLY') {
    let year = baseDate.getUTCFullYear()
    const month = baseDate.getUTCMonth()

    if (rule.byDay) {
      const { dow, pos } = parseOrdinalDay(rule.byDay)
      if (!advance) {
        const candidate = nthWeekdayInMonth(year, month, dow, pos)
        if (candidate > baseDate) return candidate.toISOString().slice(0, 10)
      }
      return nthWeekdayInMonth(year + rule.interval, month, dow, pos).toISOString().slice(0, 10)
    }

    if (rule.byMonthDay !== undefined) {
      const dom = Math.min(rule.byMonthDay, 28)
      if (!advance) {
        const candidate = new Date(Date.UTC(year, month, dom))
        if (candidate > baseDate) return candidate.toISOString().slice(0, 10)
      }
      return new Date(Date.UTC(year + rule.interval, month, dom)).toISOString().slice(0, 10)
    }

    // Plain FREQ=YEARLY;INTERVAL=N — advance by interval years from base date
    return new Date(Date.UTC(year + rule.interval, month, baseDate.getUTCDate())).toISOString().slice(0, 10)
  }

  // Fallback
  return new Date(baseDate.getTime() + 86400000).toISOString().slice(0, 10)
}
