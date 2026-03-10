import { useRef, useMemo, useState, useEffect, Fragment } from 'react'
import { createFileRoute, Link, useNavigate, useRouteContext } from '@tanstack/react-router'
import { AlertTriangle, Plus, Trash2, Pencil, Check, X, ChevronDown, Repeat, RefreshCw, CheckCircle2, AlertCircle, Wand2, List, CalendarDays, Star, ThumbsDown, Clock } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import { formatTime, formatDuration, formatDate, getDatesInRange, addDays } from '@/lib/date-utils'
import { ScheduleCalendar } from '@/components/ScheduleCalendar'
import type { ScheduleView, ScheduleStatus, ShiftAssignmentView, RecurrenceMode } from '@/lib/schedule.types'
import type { StaffMemberView } from '@/lib/staff.types'
import type { PositionView, EligibilityWarning, EligibleStaffMember } from '@/lib/qualifications.types'
import type { ScheduleRequirementView } from '@/lib/schedule-requirement.types'
import {
  getScheduleServerFn,
  updateScheduleServerFn,
  deleteScheduleServerFn,
  createAssignmentServerFn,
  createRecurringAssignmentsServerFn,
  updateAssignmentServerFn,
  deleteAssignmentServerFn,
  applyConstraintsToScheduleServerFn,
} from '@/server/schedule'
import { listStaffServerFn } from '@/server/staff'
import { listPositionsServerFn, checkPositionEligibilityServerFn } from '@/server/qualifications'
import { listScheduleRequirementsServerFn } from '@/server/schedule-requirements'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/schedules/$scheduleId',
)({
  loader: async ({ params }) => {
    const [scheduleResult, staffResult, positionsResult, requirementsResult] = await Promise.all([
      getScheduleServerFn({ data: { orgSlug: params.orgSlug, scheduleId: params.scheduleId } }),
      listStaffServerFn({ data: { orgSlug: params.orgSlug } }),
      listPositionsServerFn({ data: { orgSlug: params.orgSlug } }),
      listScheduleRequirementsServerFn({ data: { orgSlug: params.orgSlug } }),
    ])

    if (!scheduleResult.success) {
      return { schedule: null, assignments: [], staffMembers: [], positions: [], requirements: [] }
    }

    return {
      schedule: scheduleResult.schedule,
      assignments: scheduleResult.assignments,
      staffMembers: staffResult.success ? staffResult.members.filter((m) => m.status !== 'removed') : [],
      positions: positionsResult.success ? positionsResult.positions : [],
      requirements: requirementsResult.success ? requirementsResult.requirements : [],
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.schedule?.name ?? 'Schedule Detail'} | Scene Ready` }],
  }),
  component: ScheduleDetailPage,
})

function statusBadge(status: ScheduleStatus) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-success-bg text-success" style={{ fontFamily: 'var(--font-condensed)' }}>
        Published
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-warning-bg text-warning" style={{ fontFamily: 'var(--font-condensed)' }}>
      Draft
    </span>
  )
}


function groupByDate(assignments: ShiftAssignmentView[], allDates: string[]): Record<string, ShiftAssignmentView[]> {
  const groups: Record<string, ShiftAssignmentView[]> = {}
  for (const date of allDates) {
    groups[date] = []
  }
  for (const a of assignments) {
    const date = a.startDatetime.slice(0, 10)
    if (!groups[date]) groups[date] = []
    groups[date].push(a)
  }
  return groups
}

// --- Requirement evaluation ---

const RRULE_DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Returns array of day-of-week numbers (0=Sun…6=Sat) the rrule applies to, or null if every day. */
function parseRruleDays(rrule: string): number[] | null {
  if (rrule.startsWith('FREQ=DAILY')) return null
  const match = rrule.match(/BYDAY=([^;]+)/)
  if (!match) return null
  const days = match[1].split(',').map((d) => RRULE_DAY_MAP[d.trim()]).filter((n) => n !== undefined)
  return days.length > 0 ? days : null
}

type RequirementViolation = {
  date: string
  minCoverage: number
  minStaff: number
  maxStaff: number | null
  overstaffed: boolean
}

type RequirementEvaluation = {
  requirement: ScheduleRequirementView
  violations: RequirementViolation[]
  applicableDates: number
}


function computeRequirementWindow(
  date: string,
  req: ScheduleRequirementView,
  scheduleDayStart: string,
): { winStart: string; winEnd: string } {
  if (!req.windowStartTime || !req.windowEndTime || req.windowEndDayOffset == null) {
    return { winStart: `${date}T${scheduleDayStart}`, winEnd: `${addDays(date, 1)}T${scheduleDayStart}` }
  }
  return {
    winStart: `${date}T${req.windowStartTime}`,
    winEnd: `${addDays(date, req.windowEndDayOffset)}T${req.windowEndTime}`,
  }
}

/** Normalize datetime strings to YYYY-MM-DDTHH:MM format for consistent string comparison. */
function normalizeDt(dt: string): string {
  // Strip seconds if present: "2026-03-15T08:00:00" → "2026-03-15T08:00"
  // Also strip milliseconds/timezone suffix
  const t = dt.slice(0, 16)
  return t
}

/**
 * Splits a declared requirement window [winStart, winEnd] into per-org-day sub-windows.
 * Each sub-window is bounded by that org day's boundaries [dayStart, +1d dayStart).
 * Violations are attributed to the orgDate of each sub-window, not the RRULE anchor date.
 */
function expandToOrgDaySubWindows(
  winStart: string,
  winEnd: string,
  scheduleDayStart: string,
): Array<{ orgDate: string; subStart: string; subEnd: string }> {
  const result: Array<{ orgDate: string; subStart: string; subEnd: string }> = []
  // Find the org date containing winStart: if winStart's time >= dayStart, it's the same calendar date; otherwise the day before.
  const winStartDate = winStart.slice(0, 10)
  const winStartTime = winStart.slice(11, 16)
  let orgDate = winStartTime >= scheduleDayStart ? winStartDate : addDays(winStartDate, -1)
  while (true) {
    const orgDayStart = `${orgDate}T${scheduleDayStart}`
    const orgDayEnd = `${addDays(orgDate, 1)}T${scheduleDayStart}`
    if (orgDayStart >= winEnd) break
    const subStart = winStart > orgDayStart ? winStart : orgDayStart
    const subEnd = winEnd < orgDayEnd ? winEnd : orgDayEnd
    if (subStart < subEnd) result.push({ orgDate, subStart, subEnd })
    orgDate = addDays(orgDate, 1)
  }
  return result
}

function evaluateRequirements(
  requirements: ScheduleRequirementView[],
  assignments: ShiftAssignmentView[],
  allDates: string[],
  scheduleDayStart: string,
): RequirementEvaluation[] {
  if (allDates.length === 0) return requirements.map(req => ({ requirement: req, violations: [], applicableDates: 0 }))
  const scheduleStart = allDates[0]
  const scheduleEnd = allDates[allDates.length - 1]
  const allDatesSet = new Set(allDates)

  // --- Phase 1: Expand all requirement windows into per-org-day sub-windows ---
  // Look back windowEndDayOffset days before the schedule start so that windows anchored before
  // the schedule (e.g. a Fri–Sun window when the schedule starts on Sunday) are still evaluated
  // for the days they cover within the schedule.
  type ReqWindow = {
    reqId: string
    orgDate: string   // the org day this sub-window belongs to (may differ from the RRULE anchor date)
    winStart: string
    winEnd: string
    positionId: string | null; minStaff: number; maxStaff: number | null
  }
  const reqWindows: ReqWindow[] = []
  for (const req of requirements) {
    const allowedDays = parseRruleDays(req.rrule)
    const lookback = req.windowEndDayOffset ?? 1
    const anchorDates = getDatesInRange(addDays(scheduleStart, -lookback), scheduleEnd)
    for (const anchorDate of anchorDates) {
      if (anchorDate < req.effectiveStart) continue
      if (req.effectiveEnd && anchorDate > req.effectiveEnd) continue
      if (allowedDays !== null) {
        const [dy, dm, dd] = anchorDate.split('-').map(Number); const dow = new Date(Date.UTC(dy, dm - 1, dd)).getUTCDay()
        if (!allowedDays.includes(dow)) continue
      }
      const { winStart, winEnd } = computeRequirementWindow(anchorDate, req, scheduleDayStart)
      for (const sw of expandToOrgDaySubWindows(winStart, winEnd, scheduleDayStart)) {
        if (!allDatesSet.has(sw.orgDate)) continue
        reqWindows.push({ reqId: req.id, orgDate: sw.orgDate, winStart: sw.subStart, winEnd: sw.subEnd, positionId: req.positionId, minStaff: req.minStaff, maxStaff: req.maxStaff })
      }
    }
  }

  // --- Phase 2: Build unified timeline ---
  const timePoints = new Set<string>()
  for (const rw of reqWindows) { timePoints.add(rw.winStart); timePoints.add(rw.winEnd) }
  for (const a of assignments) { timePoints.add(normalizeDt(a.startDatetime)); timePoints.add(normalizeDt(a.endDatetime)) }
  const sortedTimes = [...timePoints].sort()

  // --- Phase 3: Per-segment matching ---
  type WindowStats = { minAllocated: number; maxEligible: number }
  const windowStats = new Map<string, WindowStats>()
  for (const rw of reqWindows) {
    windowStats.set(`${rw.reqId}:${rw.winStart}`, { minAllocated: rw.minStaff, maxEligible: 0 })
  }

  for (let i = 0; i < sortedTimes.length - 1; i++) {
    const segStart = sortedTimes[i]
    const segEnd = sortedTimes[i + 1]

    const activeReqs = reqWindows.filter(rw => rw.winStart <= segStart && rw.winEnd >= segEnd)
    if (activeReqs.length === 0) continue

    const activeStaff = assignments
      .filter(a => normalizeDt(a.startDatetime) <= segStart && normalizeDt(a.endDatetime) >= segEnd)
      .map(a => ({ id: a.id, positionId: a.positionId }))

    // Position-constrained requirements first (fewer eligible staff)
    const sortedReqs = [...activeReqs].sort((a, b) =>
      (a.positionId ? 0 : 1) - (b.positionId ? 0 : 1)
    )
    const pool = [...activeStaff]

    for (const rw of sortedReqs) {
      const key = `${rw.reqId}:${rw.winStart}`
      const eligibleIdxs: number[] = []
      for (let j = 0; j < pool.length; j++) {
        if (!rw.positionId || pool[j].positionId === rw.positionId) eligibleIdxs.push(j)
      }
      const totalEligible = eligibleIdxs.length
      const allocated = Math.min(totalEligible, rw.minStaff)

      // Remove allocated staff from pool
      const toRemove = eligibleIdxs.slice(0, allocated).sort((a, b) => b - a)
      for (const idx of toRemove) pool.splice(idx, 1)

      const stats = windowStats.get(key)!
      stats.minAllocated = Math.min(stats.minAllocated, allocated)
      stats.maxEligible = Math.max(stats.maxEligible, totalEligible)
    }
  }

  // --- Phase 4: Build RequirementEvaluation results ---
  // Group sub-windows by requirement for efficient lookup; violations are attributed to orgDate.
  const reqWindowsByReqId = new Map<string, ReqWindow[]>()
  for (const rw of reqWindows) {
    const arr = reqWindowsByReqId.get(rw.reqId)
    if (arr) arr.push(rw)
    else reqWindowsByReqId.set(rw.reqId, [rw])
  }

  return requirements.map((req) => {
    const windows = reqWindowsByReqId.get(req.id) ?? []
    const applicableDates = new Set(windows.map(w => w.orgDate)).size
    const violations: RequirementViolation[] = []

    for (const rw of windows) {
      const stats = windowStats.get(`${rw.reqId}:${rw.winStart}`)
      const minCoverage = stats?.minAllocated ?? 0
      const maxEligible = stats?.maxEligible ?? 0
      const overstaffed = rw.maxStaff !== null && maxEligible > rw.maxStaff

      if (minCoverage < rw.minStaff || overstaffed) {
        violations.push({ date: rw.orgDate, minCoverage, minStaff: rw.minStaff, maxStaff: rw.maxStaff, overstaffed })
      }
    }

    return { requirement: req, violations, applicableDates }
  })
}

function RequirementsPanel({ evaluations }: { evaluations: RequirementEvaluation[] }) {
  const [open, setOpen] = useState(true)
  const [expandedReqs, setExpandedReqs] = useState<Set<string>>(new Set())

  if (evaluations.length === 0) return null

  const failingCount = evaluations.filter((e) => e.violations.length > 0).length
  const allMet = failingCount === 0

  function toggleExpanded(reqId: string) {
    setExpandedReqs((prev) => {
      const next = new Set(prev)
      if (next.has(reqId)) next.delete(reqId)
      else next.add(reqId)
      return next
    })
  }

  // Earliest unfilled date across all violations
  const earliestViolation = evaluations
    .flatMap((e) => e.violations)
    .map((v) => v.date)
    .sort()[0]

  return (
    <div className="mb-6 border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-navy-700">Requirements</span>
          {allMet ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success-bg text-success" style={{ fontFamily: 'var(--font-condensed)' }}>
              All met
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-danger-bg text-danger" style={{ fontFamily: 'var(--font-condensed)' }}>
              {failingCount} issue{failingCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-200 divide-y divide-gray-100">
          {!allMet && earliestViolation && (
            <div className="px-4 py-2 bg-danger-bg/40 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />
              <span className="text-xs text-danger font-medium">
                Earliest gap: <a href={`#date-${earliestViolation}`} className="underline hover:opacity-75">{new Date(earliestViolation + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</a>
              </span>
            </div>
          )}
          {evaluations.map((ev) => {
            const na = ev.applicableDates === 0
            const ok = !na && ev.violations.length === 0
            const expanded = expandedReqs.has(ev.requirement.id)
            // Deduplicate violations by date (take worst per date)
            const uniqueDates = [...new Set(ev.violations.map((v) => v.date))].sort()

            return (
              <div key={ev.requirement.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {na ? (
                    <span className="w-4 h-4 text-gray-300 text-sm leading-none shrink-0">—</span>
                  ) : ok ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                  )}
                  <span className={`text-sm font-medium ${na ? 'text-gray-400' : ok ? 'text-success' : 'text-danger'}`}>{ev.requirement.name}</span>
                  {ev.requirement.positionName && (
                    <span className={`text-xs ${na ? 'text-gray-400' : ok ? 'text-success' : 'text-danger'}`}>({ev.requirement.positionName})</span>
                  )}
                  <span className={`text-xs ml-auto ${na ? 'text-gray-400' : ok ? 'text-success' : 'text-danger'}`}>
                    min {ev.requirement.minStaff}{ev.requirement.maxStaff != null ? ` / max ${ev.requirement.maxStaff}` : ''}
                  </span>
                  {na && <span className="text-xs text-gray-400 italic">No applicable dates in range</span>}
                </div>
                {uniqueDates.length > 0 && (
                  <div className="ml-6 mt-1.5">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(ev.requirement.id)}
                      className="flex items-center gap-1.5 text-xs text-danger font-medium hover:underline"
                    >
                      <span>{uniqueDates.length} day{uniqueDates.length !== 1 ? 's' : ''} with gaps</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && (
                      <div className="mt-1.5 space-y-0.5 pl-1">
                        {uniqueDates.map((date) => {
                          const v = ev.violations.find((vv) => vv.date === date)!
                          return (
                            <p key={date} className="text-xs text-danger">
                              <a href={`#date-${date}`} className="underline hover:opacity-75">
                                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </a>
                              {': '}
                              {v.minCoverage < v.minStaff
                                ? `${v.minCoverage} of ${v.minStaff} required`
                                : v.overstaffed && v.maxStaff !== null
                                  ? `overstaffed (max ${v.maxStaff})`
                                  : ''}
                            </p>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StaffHoursSummary({ assignments }: { assignments: ShiftAssignmentView[] }) {
  const [open, setOpen] = useState(false)

  const staffHours = useMemo(() => {
    const map = new Map<string, { name: string; totalMinutes: number; shiftCount: number }>()
    for (const a of assignments) {
      const existing = map.get(a.staffMemberId)
      const ms = new Date(a.endDatetime).getTime() - new Date(a.startDatetime).getTime()
      const minutes = Math.round(ms / 60000)
      if (existing) {
        existing.totalMinutes += minutes
        existing.shiftCount += 1
      } else {
        map.set(a.staffMemberId, { name: a.staffMemberName, totalMinutes: minutes, shiftCount: 1 })
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [assignments])

  if (staffHours.length === 0) return null

  const totalHours = staffHours.reduce((sum, s) => sum + s.totalMinutes, 0)

  function fmtHours(minutes: number) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }

  return (
    <div className="mb-6 border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-navy-700">Staff Hours</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>
            {staffHours.length} staff &middot; {fmtHours(totalHours)} total
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 font-semibold text-gray-600">Name</th>
                <th className="px-4 py-2 font-semibold text-gray-600 text-right">Shifts</th>
                <th className="px-4 py-2 font-semibold text-gray-600 text-right">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staffHours.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-2 text-gray-900">{s.name}</td>
                  <td className="px-4 py-2 text-gray-600 text-right">{s.shiftCount}</td>
                  <td className="px-4 py-2 text-gray-900 font-medium text-right">{fmtHours(s.totalMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ScheduleDetailPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const navigate = useNavigate()
  const loaderData = Route.useLoaderData()

  const canEdit = canDo(userRole, 'create-edit-schedules')

  if (!loaderData.schedule) {
    return (
      <div>
        <p className="text-gray-500">Schedule not found.</p>
        <Link to="/orgs/$orgSlug/schedules" params={{ orgSlug: org.slug }} className="text-navy-700 hover:underline text-sm mt-2 inline-block">
          Back to schedules
        </Link>
      </div>
    )
  }

  const [schedule, setSchedule] = useState<ScheduleView>(loaderData.schedule)
  const [assignments, setAssignments] = useState<ShiftAssignmentView[]>(loaderData.assignments)
  const staffMembers: StaffMemberView[] = loaderData.staffMembers
  const positions: PositionView[] = loaderData.positions
  const requirements: ScheduleRequirementView[] = loaderData.requirements
  // Map of assignmentId → eligibility warnings
  const [assignmentWarnings, setAssignmentWarnings] = useState<Map<string, EligibilityWarning[]>>(new Map())
  const [viewType, setViewType] = useState<'table' | 'calendar'>('table')

  const allDatesForEval = useMemo(() => getDatesInRange(schedule.startDate, schedule.endDate), [schedule.startDate, schedule.endDate])
  const requirementEvaluations = useMemo(
    () => evaluateRequirements(requirements, assignments, allDatesForEval, org.scheduleDayStart),
    [requirements, assignments, allDatesForEval, org.scheduleDayStart],
  )
  const dateViolationMap = useMemo(() => {
    const map = new Map<string, Array<{ name: string; minCoverage: number; minStaff: number; maxStaff: number | null; overstaffed: boolean; positionId: string | null; positionName: string | null }>>()
    for (const ev of requirementEvaluations) {
      for (const v of ev.violations) {
        const existing = map.get(v.date) ?? []
        existing.push({ name: ev.requirement.name, minCoverage: v.minCoverage, minStaff: v.minStaff, maxStaff: v.maxStaff, overstaffed: v.overstaffed, positionId: ev.requirement.positionId, positionName: ev.requirement.positionName })
        map.set(v.date, existing)
      }
    }
    return map
  }, [requirementEvaluations])

  // Edit schedule state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(schedule.name)
  const [editStartDate, setEditStartDate] = useState(schedule.startDate)
  const [editEndDate, setEditEndDate] = useState(schedule.endDate)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Add assignment state
  const [showAddForm, setShowAddForm] = useState(false)
  const [addStaffId, setAddStaffId] = useState('')
  const [addStartDatetime, setAddStartDatetime] = useState('')
  const [addEndDatetime, setAddEndDatetime] = useState('')
  const [addPosition, setAddPosition] = useState('')
  const [addPositionId, setAddPositionId] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [addRecurring, setAddRecurring] = useState(false)
  const [addRecurrenceMode, setAddRecurrenceMode] = useState<RecurrenceMode>('days-of-week')
  const [addStartTime, setAddStartTime] = useState('')
  const [addEndTime, setAddEndTime] = useState('')
  const [addDaysOfWeek, setAddDaysOfWeek] = useState<number[]>([])
  const [addEveryNDays, setAddEveryNDays] = useState(1)
  const [addStartingFrom, setAddStartingFrom] = useState(schedule?.startDate ?? '')

  // Edit assignment state
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null)
  const [editAssignStaffId, setEditAssignStaffId] = useState('')
  const [editAssignStart, setEditAssignStart] = useState('')
  const [editAssignEnd, setEditAssignEnd] = useState('')
  const [editAssignPosition, setEditAssignPosition] = useState('')
  const [editAssignPositionId, setEditAssignPositionId] = useState('')
  const [editAssignNotes, setEditAssignNotes] = useState('')
  const [editAssignBusy, setEditAssignBusy] = useState(false)

  // Delete states
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState(false)
  const [deleteScheduleBusy, setDeleteScheduleBusy] = useState(false)
  const [confirmDeleteAssignment, setConfirmDeleteAssignment] = useState<string | null>(null)
  const [deleteAssignmentBusy, setDeleteAssignmentBusy] = useState<string | null>(null)

  const [statusBusy, setStatusBusy] = useState(false)

  const [applyConstraintsBusy, setApplyConstraintsBusy] = useState(false)
  const [applyConstraintsChanged, setApplyConstraintsChanged] = useState<number | null>(null)

  const addFormRef = useRef<HTMLFormElement>(null)

  function quickAddForDate(date: string, positionId?: string | null, positionName?: string | null) {
    resetAddForm()
    setAddRecurring(false)
    setAddStartDatetime(`${date}T08:00`)
    setAddEndDatetime(`${date}T16:00`)
    if (positionId) {
      setAddPositionId(positionId)
      setAddPosition(positionName ?? '')
    } else if (positionName) {
      setAddPosition(positionName)
    }
    setShowAddForm(true)
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function handleUpdateSchedule(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setEditError(null)
    if (!editName.trim()) { setEditError('Name is required.'); return }
    if (editEndDate < editStartDate) { setEditError('End date must be on or after start date.'); return }

    setEditBusy(true)
    try {
      const result = await updateScheduleServerFn({
        data: { orgSlug: org.slug, scheduleId: schedule.id, name: editName.trim(), startDate: editStartDate, endDate: editEndDate },
      })
      if (result.success) {
        setSchedule((s) => ({ ...s, name: editName.trim(), startDate: editStartDate, endDate: editEndDate }))
        setEditing(false)
      } else {
        setEditError('Failed to update schedule.')
      }
    } finally {
      setEditBusy(false)
    }
  }

  async function handleToggleStatus() {
    const newStatus: ScheduleStatus = schedule.status === 'draft' ? 'published' : 'draft'
    setStatusBusy(true)
    try {
      const result = await updateScheduleServerFn({
        data: { orgSlug: org.slug, scheduleId: schedule.id, status: newStatus },
      })
      if (result.success) {
        setSchedule((s) => ({ ...s, status: newStatus }))
      }
    } finally {
      setStatusBusy(false)
    }
  }

  async function handleApplyConstraints() {
    setApplyConstraintsBusy(true)
    setApplyConstraintsChanged(null)
    try {
      const result = await applyConstraintsToScheduleServerFn({
        data: { orgSlug: org.slug, scheduleId: schedule.id },
      })
      if (result.success) {
        setAssignments(result.assignments)
        setSchedule((s) => ({ ...s, assignmentCount: result.assignments.length }))
        setApplyConstraintsChanged(result.changed)
      }
    } finally {
      setApplyConstraintsBusy(false)
    }
  }

  async function handleDeleteSchedule() {
    setDeleteScheduleBusy(true)
    try {
      const result = await deleteScheduleServerFn({
        data: { orgSlug: org.slug, scheduleId: schedule.id },
      })
      if (result.success) {
        await navigate({ to: '/orgs/$orgSlug/schedules', params: { orgSlug: org.slug } })
      }
    } finally {
      setDeleteScheduleBusy(false)
    }
  }

  function resetAddForm() {
    setAddStaffId(''); setAddStartDatetime(''); setAddEndDatetime('')
    setAddStartTime(''); setAddEndTime(''); setAddDaysOfWeek([])
    setAddEveryNDays(1); setAddStartingFrom(schedule.startDate)
    setAddRecurrenceMode('days-of-week')
    setAddPosition(''); setAddPositionId(''); setAddNotes(''); setAddRecurring(false)
    setShowAddForm(false)
  }

  function toggleDay(day: number) {
    setAddDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  function applyQuickShift(preset: '24h' | 'day' | 'night') {
    const dateStr = addStartDatetime ? addStartDatetime.slice(0, 10) : schedule.startDate
    const [y, m, d] = dateStr.split('-').map(Number)
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
    if (preset === '24h') {
      setAddStartDatetime(`${dateStr}T07:00`)
      setAddEndDatetime(`${nextDay}T07:00`)
    } else if (preset === 'day') {
      setAddStartDatetime(`${dateStr}T07:00`)
      setAddEndDatetime(`${dateStr}T19:00`)
    } else {
      setAddStartDatetime(`${dateStr}T19:00`)
      setAddEndDatetime(`${nextDay}T07:00`)
    }
  }

  function getShiftPreview(): string | null {
    if (!addStartDatetime || !addEndDatetime) return null
    const start = new Date(addStartDatetime)
    const end = new Date(addEndDatetime)
    const ms = end.getTime() - start.getTime()
    if (ms <= 0) return null
    const hours = Math.round(ms / 3600000)
    const dayLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    return `${hours}h · ${dayLabel}`
  }

  async function handleAddAssignment(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddError(null)
    if (!addStaffId) { setAddError('Select a staff member.'); return }

    setAddBusy(true)
    try {
      if (addRecurring) {
        if (!addStartTime || !addEndTime) { setAddError('Start and end times are required.'); setAddBusy(false); return }
        if (addRecurrenceMode === 'days-of-week' && addDaysOfWeek.length === 0) {
          setAddError('Select at least one day of the week.'); setAddBusy(false); return
        }
        if (addRecurrenceMode === 'every-n-days' && (!addEveryNDays || addEveryNDays < 1 || !addStartingFrom)) {
          setAddError('Interval and starting date are required.'); setAddBusy(false); return
        }

        const result = await createRecurringAssignmentsServerFn({
          data: {
            orgSlug: org.slug,
            scheduleId: schedule.id,
            staffMemberId: addStaffId,
            startTime: addStartTime,
            endTime: addEndTime,
            mode: addRecurrenceMode,
            daysOfWeek: addRecurrenceMode === 'days-of-week' ? addDaysOfWeek : undefined,
            everyNDays: addRecurrenceMode === 'every-n-days' ? addEveryNDays : undefined,
            startingFrom: addRecurrenceMode === 'every-n-days' ? addStartingFrom : undefined,
            position: addPosition.trim() || undefined,
            notes: addNotes.trim() || undefined,
          },
        })
        if (result.success) {
          const scrollDate = result.assignments[0]?.startDatetime.slice(0, 10)
          setAssignments((prev) =>
            [...prev, ...result.assignments].sort((a, b) => a.startDatetime.localeCompare(b.startDatetime) || b.positionSortOrder - a.positionSortOrder || a.staffMemberName.localeCompare(b.staffMemberName)),
          )
          setSchedule((s) => ({ ...s, assignmentCount: s.assignmentCount + result.assignments.length }))
          resetAddForm()
          if (scrollDate) requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`date-${scrollDate}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })))
        } else {
          const msgs: Record<string, string> = {
            FORBIDDEN: 'You do not have permission.',
            NOT_FOUND: 'Schedule or staff member not found.',
            VALIDATION_ERROR: 'No matching days found. Check your selected days.',
          }
          setAddError(msgs[result.error] ?? 'An error occurred.')
        }
      } else {
        if (!addStartDatetime || !addEndDatetime) { setAddError('Start and end times are required.'); setAddBusy(false); return }
        if (addEndDatetime <= addStartDatetime) { setAddError('End time must be after start time.'); setAddBusy(false); return }

        const result = await createAssignmentServerFn({
          data: {
            orgSlug: org.slug,
            scheduleId: schedule.id,
            staffMemberId: addStaffId,
            startDatetime: addStartDatetime,
            endDatetime: addEndDatetime,
            position: addPosition.trim() || undefined,
            positionId: addPositionId || null,
            notes: addNotes.trim() || undefined,
          },
        })
        if (result.success) {
          const scrollDate = result.assignment.startDatetime.slice(0, 10)
          setAssignments((prev) =>
            [...prev, result.assignment].sort((a, b) => a.startDatetime.localeCompare(b.startDatetime) || b.positionSortOrder - a.positionSortOrder || a.staffMemberName.localeCompare(b.staffMemberName)),
          )
          setSchedule((s) => ({ ...s, assignmentCount: s.assignmentCount + 1 }))
          if (result.warnings.length > 0) {
            setAssignmentWarnings((prev) => new Map(prev).set(result.assignment.id, result.warnings))
          }
          resetAddForm()
          requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`date-${scrollDate}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })))
        } else {
          const msgs: Record<string, string> = {
            FORBIDDEN: 'You do not have permission.',
            NOT_FOUND: 'Schedule or staff member not found.',
            VALIDATION_ERROR: 'Please check form fields.',
          }
          setAddError(msgs[result.error] ?? 'An error occurred.')
        }
      }
    } finally {
      setAddBusy(false)
    }
  }

  function startEditAssignment(a: ShiftAssignmentView) {
    setEditingAssignment(a.id)
    setEditAssignStaffId(a.staffMemberId)
    setEditAssignStart(a.startDatetime.slice(0, 16))
    setEditAssignEnd(a.endDatetime.slice(0, 16))
    setEditAssignPosition(a.position ?? '')
    setEditAssignPositionId(a.positionId ?? '')
    setEditAssignNotes(a.notes ?? '')
  }

  async function handleUpdateAssignment(assignmentId: string) {
    setEditAssignBusy(true)
    try {
      const result = await updateAssignmentServerFn({
        data: {
          orgSlug: org.slug,
          assignmentId,
          staffMemberId: editAssignStaffId,
          startDatetime: editAssignStart,
          endDatetime: editAssignEnd,
          position: editAssignPosition.trim() || null,
          positionId: editAssignPositionId || null,
          notes: editAssignNotes.trim() || null,
        },
      })
      if (result.success) {
        const staffName = staffMembers.find((s) => s.id === editAssignStaffId)?.name ?? ''
        setAssignments((prev) =>
          prev
            .map((a) =>
              a.id === assignmentId
                ? {
                    ...a,
                    staffMemberId: editAssignStaffId,
                    staffMemberName: staffName,
                    startDatetime: editAssignStart,
                    endDatetime: editAssignEnd,
                    position: editAssignPosition.trim() || null,
                    positionId: editAssignPositionId || null,
                    notes: editAssignNotes.trim() || null,
                  }
                : a,
            )
            .sort((a, b) => a.startDatetime.localeCompare(b.startDatetime) || b.positionSortOrder - a.positionSortOrder || a.staffMemberName.localeCompare(b.staffMemberName)),
        )
        if (result.warnings.length > 0) {
          setAssignmentWarnings((prev) => new Map(prev).set(assignmentId, result.warnings))
        } else {
          setAssignmentWarnings((prev) => { const m = new Map(prev); m.delete(assignmentId); return m })
        }
        setEditingAssignment(null)
      }
    } finally {
      setEditAssignBusy(false)
    }
  }

  async function handleDeleteAssignment(assignmentId: string) {
    setDeleteAssignmentBusy(assignmentId)
    try {
      const result = await deleteAssignmentServerFn({
        data: { orgSlug: org.slug, assignmentId },
      })
      if (result.success) {
        setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
        setSchedule((s) => ({ ...s, assignmentCount: s.assignmentCount - 1 }))
        setConfirmDeleteAssignment(null)
      }
    } finally {
      setDeleteAssignmentBusy(null)
    }
  }

  const allDates = getDatesInRange(schedule.startDate, schedule.endDate)
  const grouped = groupByDate(assignments, allDates)
  const sortedDates = allDates

  return (
    <div>
      {/* Schedule Header */}
      {editing && canEdit ? (
        <form onSubmit={handleUpdateSchedule} className="mb-6 p-5 rounded-lg border border-gray-200 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
          </div>
          {editError && <p className="mt-3 text-sm text-danger">{editError}</p>}
          <div className="flex items-center gap-3 mt-4">
            <button type="submit" disabled={editBusy} className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors">
              {editBusy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-navy-700">{schedule.name}</h1>
              {statusBadge(schedule.status)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-gray-500">
                {new Date(schedule.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {' – '}
                {new Date(schedule.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {schedule.createdByName && <> &middot; Created by {schedule.createdByName}</>}
              </p>
              <div className="flex items-center bg-gray-100 rounded-md p-0.5 ml-3">
                <button
                  type="button"
                  onClick={() => setViewType('table')}
                  className={`p-1.5 rounded transition-colors ${viewType === 'table' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Table view"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewType('calendar')}
                  className={`p-1.5 rounded transition-colors ${viewType === 'calendar' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Calendar view"
                >
                  <CalendarDays className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditName(schedule.name)
                  setEditStartDate(schedule.startDate)
                  setEditEndDate(schedule.endDate)
                  setEditing(true)
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void handleApplyConstraints()}
                  disabled={applyConstraintsBusy}
                  title="Re-evaluate schedule requirements and flag staffing gaps — does not modify assignments"
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-md text-sm transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${applyConstraintsBusy ? 'animate-spin' : ''}`} />
                  {applyConstraintsBusy ? 'Checking…' : 'Check Requirements'}
                </button>
                {applyConstraintsChanged !== null && (
                  <span className="text-xs text-gray-500">
                    {applyConstraintsChanged === 0 ? 'No changes' : `${applyConstraintsChanged} updated`}
                  </span>
                )}
              </div>
              <button
                onClick={() => void handleToggleStatus()}
                disabled={statusBusy}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-md text-sm transition-colors"
              >
                {statusBusy ? '…' : schedule.status === 'draft' ? 'Publish' : 'Unpublish'}
              </button>
              {confirmDeleteSchedule ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Delete schedule?</span>
                  <button
                    onClick={() => void handleDeleteSchedule()}
                    disabled={deleteScheduleBusy}
                    className="px-2 py-1 bg-danger hover:opacity-90 disabled:opacity-50 text-white rounded-md text-xs"
                  >
                    {deleteScheduleBusy ? '…' : 'Yes'}
                  </button>
                  <button onClick={() => setConfirmDeleteSchedule(false)} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-xs">
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteSchedule(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-danger-bg text-gray-500 hover:text-danger rounded-md text-sm transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Assignment */}
      {canEdit && (
        <div className="mb-6">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Assignment
            </button>
          ) : (
            <form ref={addFormRef} onSubmit={handleAddAssignment} className="p-5 rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-navy-700">New assignment</h2>
                <button
                  type="button"
                  onClick={() => setAddRecurring((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${addRecurring ? 'bg-navy-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  {addRecurring ? 'Recurring' : 'Repeat…'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Staff Member <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={addStaffId}
                      onChange={(e) => setAddStaffId(e.target.value)}
                      className="w-full appearance-none px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                    >
                      <option value="">Select staff member…</option>
                      {staffMembers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  {!addRecurring && (
                    <button
                      type="button"
                      onClick={() => setShowWizard(true)}
                      className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 border border-navy-500 text-navy-700 hover:bg-navy-50 rounded-md text-xs font-medium transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Find Available Staff
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Position</label>
                  {positions.length > 0 ? (
                    <div className="relative">
                      <select
                        value={addPositionId}
                        onChange={(e) => {
                          const posId = e.target.value
                          setAddPositionId(posId)
                          if (posId) {
                            const pos = positions.find((p) => p.id === posId)
                            if (pos) setAddPosition(pos.name)
                          } else {
                            setAddPosition('')
                          }
                        }}
                        className="w-full appearance-none px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                      >
                        <option value="">Custom / none</option>
                        {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={addPosition}
                      onChange={(e) => setAddPosition(e.target.value)}
                      placeholder="e.g. Engine 1, Medic 2"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
                    />
                  )}
                  {positions.length > 0 && !addPositionId && (
                    <input
                      type="text"
                      value={addPosition}
                      onChange={(e) => setAddPosition(e.target.value)}
                      placeholder="Custom label (optional)"
                      className="w-full mt-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
                    />
                  )}
                </div>
                {addRecurring ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Start Time <span className="text-danger">*</span>
                      </label>
                      <input
                        type="time"
                        value={addStartTime}
                        onChange={(e) => setAddStartTime(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        End Time <span className="text-danger">*</span>
                      </label>
                      <input
                        type="time"
                        value={addEndTime}
                        onChange={(e) => setAddEndTime(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                      />
                      {addStartTime && addEndTime && addEndTime <= addStartTime && (
                        <p className="text-xs text-gray-400 mt-1">Shift ends the following day</p>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Repeat Pattern <span className="text-danger">*</span>
                      </label>
                      <div className="flex gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => setAddRecurrenceMode('days-of-week')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            addRecurrenceMode === 'days-of-week'
                              ? 'bg-navy-700 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Days of week
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddRecurrenceMode('every-n-days')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            addRecurrenceMode === 'every-n-days'
                              ? 'bg-navy-700 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Every N days
                        </button>
                      </div>
                      {addRecurrenceMode === 'days-of-week' ? (
                        <div className="flex gap-1.5">
                          {(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).map((label, i) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => toggleDay(i)}
                              className={`w-10 h-9 rounded-md text-xs font-semibold transition-colors ${
                                addDaysOfWeek.includes(i)
                                  ? 'bg-navy-700 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-gray-600">Every</label>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={addEveryNDays}
                            onChange={(e) => setAddEveryNDays(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                          />
                          <label className="text-sm text-gray-600">day{addEveryNDays !== 1 ? 's' : ''}, starting</label>
                          <input
                            type="date"
                            value={addStartingFrom}
                            onChange={(e) => setAddStartingFrom(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                          />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-600">Quick Shift</span>
                      </div>
                      <div className="flex gap-2">
                        {([
                          { label: '24h (7A–7A)', preset: '24h' as const },
                          { label: 'Day (7A–7P)', preset: 'day' as const },
                          { label: 'Night (7P–7A)', preset: 'night' as const },
                        ] as const).map(({ label, preset }) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => applyQuickShift(preset)}
                            className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Start <span className="text-danger">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={addStartDatetime}
                        onChange={(e) => setAddStartDatetime(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        End <span className="text-danger">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={addEndDatetime}
                        onChange={(e) => setAddEndDatetime(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                      />
                      {getShiftPreview() && (
                        <p className="mt-1 text-xs text-gray-500 font-medium">{getShiftPreview()}</p>
                      )}
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Notes</label>
                  <input
                    type="text"
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
                  />
                </div>
              </div>
              {addError && <p className="mt-3 text-sm text-danger">{addError}</p>}
              <div className="flex items-center gap-3 mt-4">
                <button type="submit" disabled={addBusy} className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors">
                  {addBusy ? (addRecurring ? 'Adding shifts…' : 'Adding…') : (addRecurring ? `Add recurring shifts` : 'Add assignment')}
                </button>
                <button type="button" onClick={() => { resetAddForm(); setAddError(null) }} className="px-4 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Requirements evaluation */}
      <RequirementsPanel evaluations={requirementEvaluations} />

      {/* Staff hours summary */}
      <StaffHoursSummary assignments={assignments} />

      {/* Assignments */}
      {viewType === 'calendar' ? (
        <ScheduleCalendar
          schedule={schedule}
          assignments={assignments}
          onEditAssignment={canEdit ? (a) => startEditAssignment(a) : undefined}
          onQuickAdd={canEdit ? (date) => quickAddForDate(date) : undefined}
        />
      ) : (
      <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              {canEdit && <col className="w-[16%]" />}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Staff</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Time</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Position</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Notes</th>
                {canEdit && (
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedDates.map((date) => {
                const dayViolations = dateViolationMap.get(date) ?? []
                const staffCount = grouped[date].length
                const totalHours = grouped[date].reduce((sum, a) => {
                  return sum + (new Date(a.endDatetime).getTime() - new Date(a.startDatetime).getTime()) / 3600000
                }, 0)
                const manDays = (totalHours / 24).toFixed(1)
                const hasViolations = dayViolations.length > 0
                const hasRequirements = requirements.length > 0
                const dayBorderClass = hasViolations
                  ? 'border-l-4 border-l-danger'
                  : hasRequirements
                    ? 'border-l-4 border-l-success'
                    : ''
                return (
                <Fragment key={date}>
                  <tr id={`date-${date}`} className={`border-b border-gray-200 bg-gray-50/50 scroll-mt-4 ${dayBorderClass}`}>
                    <td colSpan={canEdit ? 5 : 4} className="px-4 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>
                            {formatDate(date + 'T00:00:00')}
                          </span>
                          {staffCount > 0 && (
                            <span className={`text-xs font-medium ${hasViolations ? 'text-danger' : hasRequirements ? 'text-success' : 'text-gray-400'}`}>
                              {staffCount} staff · {manDays} man-days
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {dayViolations.map((v, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => quickAddForDate(date, v.positionId, v.positionName)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-danger bg-danger-bg text-danger text-xs font-semibold hover:opacity-75 transition-opacity"
                              title={v.minCoverage < v.minStaff ? `${v.name}: ${v.minCoverage} assigned, need ≥ ${v.minStaff} — click to add` : `${v.name}: overstaffed (max ${v.maxStaff}) — click to add`}
                              style={{ fontFamily: 'var(--font-condensed)' }}
                            >
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              {v.name}: {v.minCoverage < v.minStaff ? `${v.minCoverage}/${v.minStaff}` : `over ${v.maxStaff}`}
                            </button>
                          ))}
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => quickAddForDate(date)}
                            className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-navy-700 hover:bg-white rounded transition-colors shrink-0"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {grouped[date].length === 0 && (
                    <tr className="border-b border-gray-200">
                      <td colSpan={canEdit ? 5 : 4} className="px-4 py-2 text-gray-400 text-xs italic">
                        No assignments
                      </td>
                    </tr>
                  )}
                  {grouped[date].map((a) => {
                    if (editingAssignment === a.id && canEdit) {
                      return (
                        <tr key={a.id} className="border-b border-gray-200 last:border-0">
                          <td colSpan={canEdit ? 5 : 4} className="p-0">
                            <div className="border-l-4 border-l-navy-500 bg-blue-50/40 px-4 py-3 space-y-3">
                              {/* Row 1: Staff + Position */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Staff Member</label>
                                  <div className="relative">
                                    <select
                                      value={editAssignStaffId}
                                      onChange={(e) => setEditAssignStaffId(e.target.value)}
                                      className="w-full appearance-none px-2 py-1.5 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                                    >
                                      {staffMembers.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                    </select>
                                    <ChevronDown className="absolute right-1.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Position</label>
                                  {positions.length > 0 ? (
                                    <div>
                                      <div className="relative">
                                        <select
                                          value={editAssignPositionId}
                                          onChange={(e) => {
                                            const posId = e.target.value
                                            setEditAssignPositionId(posId)
                                            if (posId) {
                                              const pos = positions.find((p) => p.id === posId)
                                              if (pos) setEditAssignPosition(pos.name)
                                            }
                                          }}
                                          className="w-full appearance-none px-2 py-1.5 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
                                        >
                                          <option value="">Custom / none</option>
                                          {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                        <ChevronDown className="absolute right-1.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                      </div>
                                      {!editAssignPositionId && (
                                        <input type="text" value={editAssignPosition} onChange={(e) => setEditAssignPosition(e.target.value)} className="w-full mt-1 px-2 py-1.5 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500" placeholder="Custom label" />
                                      )}
                                    </div>
                                  ) : (
                                    <input type="text" value={editAssignPosition} onChange={(e) => setEditAssignPosition(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500" />
                                  )}
                                </div>
                              </div>
                              {/* Row 2: Start → End + Notes + Actions */}
                              <div className="flex items-end gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                                  <div className="flex gap-1">
                                    <input
                                      type="date"
                                      value={editAssignStart.slice(0, 10)}
                                      onChange={(e) => setEditAssignStart(e.target.value + 'T' + (editAssignStart.slice(11, 16) || '00:00'))}
                                      className="px-2 py-1.5 bg-white border border-gray-300 rounded-md text-xs focus:outline-none focus:border-navy-500"
                                    />
                                    <input
                                      type="time"
                                      value={editAssignStart.slice(11, 16)}
                                      onChange={(e) => setEditAssignStart((editAssignStart.slice(0, 10) || '') + 'T' + e.target.value)}
                                      className="px-2 py-1.5 bg-white border border-gray-300 rounded-md text-xs focus:outline-none focus:border-navy-500 w-24"
                                    />
                                  </div>
                                </div>
                                <span className="text-gray-400 pb-2">→</span>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                                  <div className="flex gap-1">
                                    <input
                                      type="date"
                                      value={editAssignEnd.slice(0, 10)}
                                      onChange={(e) => setEditAssignEnd(e.target.value + 'T' + (editAssignEnd.slice(11, 16) || '00:00'))}
                                      className="px-2 py-1.5 bg-white border border-gray-300 rounded-md text-xs focus:outline-none focus:border-navy-500"
                                    />
                                    <input
                                      type="time"
                                      value={editAssignEnd.slice(11, 16)}
                                      onChange={(e) => setEditAssignEnd((editAssignEnd.slice(0, 10) || '') + 'T' + e.target.value)}
                                      className="px-2 py-1.5 bg-white border border-gray-300 rounded-md text-xs focus:outline-none focus:border-navy-500 w-24"
                                    />
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                                  <input type="text" value={editAssignNotes} onChange={(e) => setEditAssignNotes(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500" placeholder="Optional" />
                                </div>
                                <div className="flex items-center gap-1 pb-0.5">
                                  <button onClick={() => void handleUpdateAssignment(a.id)} disabled={editAssignBusy} className="p-1.5 text-success hover:bg-success-bg rounded transition-colors" title="Save">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setEditingAssignment(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors" title="Cancel">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    const confirming = confirmDeleteAssignment === a.id
                    const busy = deleteAssignmentBusy === a.id

                    const rowWarnings = assignmentWarnings.get(a.id) ?? []

                    return (
                      <tr key={a.id} className="group border-b border-gray-200 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-900 font-medium truncate">
                          <div className="flex items-center gap-1.5">
                            {a.staffMemberName}
                            {rowWarnings.length > 0 && (
                              <span title={rowWarnings.map((w) => w.type + (w.certTypeName ? `: ${w.certTypeName}` : '')).join(', ')}>
                                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                          {formatTime(a.startDatetime)} – {formatTime(a.endDatetime)}
                          <span className="ml-1.5 text-xs text-gray-400">({formatDuration(a.startDatetime, a.endDatetime)})</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 truncate">{a.position ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-500 truncate">{a.notes ?? '—'}</td>
                        {canEdit && (
                          <td className="px-4 py-2">
                            <div className={`flex items-center justify-end gap-2 transition-opacity ${confirming ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              <button onClick={() => startEditAssignment(a)} className="p-1 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <div className="w-px h-3.5 bg-gray-200 shrink-0" />
                              {confirming ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => void handleDeleteAssignment(a.id)} disabled={busy} className="px-2 py-0.5 bg-danger hover:opacity-90 disabled:opacity-50 text-white rounded text-xs">
                                    {busy ? '…' : 'Yes'}
                                  </button>
                                  <button onClick={() => setConfirmDeleteAssignment(null)} className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs">
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmDeleteAssignment(a.id)} className="p-1 text-gray-400 hover:text-danger hover:bg-danger-bg rounded transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </Fragment>
              )
              })}
            </tbody>
          </table>
        </div>
      )}


      {showWizard && (
        <StaffingWizardModal
          orgSlug={org.slug}
          positionId={addPositionId || null}
          positionName={addPositionId ? (positions.find((p) => p.id === addPositionId)?.name ?? null) : null}
          targetDate={addStartDatetime ? addStartDatetime.slice(0, 10) : ''}
          allStaff={staffMembers}
          assignments={assignments}
          onSelect={(id) => { setAddStaffId(id); setShowWizard(false) }}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  )
}

interface StaffingWizardModalProps {
  orgSlug: string
  positionId: string | null
  positionName: string | null
  targetDate: string
  allStaff: StaffMemberView[]
  assignments: ShiftAssignmentView[]
  onSelect: (staffMemberId: string) => void
  onClose: () => void
}

function StaffingWizardModal({ orgSlug, positionId, positionName, targetDate: initialTargetDate, allStaff, assignments, onSelect, onClose }: StaffingWizardModalProps) {
  const [localDate, setLocalDate] = useState(initialTargetDate)
  const [loading, setLoading] = useState(false)
  const [eligible, setEligible] = useState<EligibleStaffMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scheduledIds = useMemo(() => {
    if (!localDate) return new Set<string>()
    return new Set(
      assignments
        .filter((a) => a.startDatetime.slice(0, 10) === localDate)
        .map((a) => a.staffMemberId),
    )
  }, [assignments, localDate])

  const adjacentIds = useMemo(() => {
    if (!localDate) return new Set<string>()
    const d = new Date(localDate + 'T00:00:00')
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    const prevStr = prev.toISOString().slice(0, 10)
    const nextStr = next.toISOString().slice(0, 10)
    return new Set(
      assignments
        .filter((a) => {
          const aDate = a.startDatetime.slice(0, 10)
          return aDate === prevStr || aDate === nextStr
        })
        .map((a) => a.staffMemberId),
    )
  }, [assignments, localDate])

  const staffStats = useMemo(() => {
    const map = new Map<string, { shifts: number; minutes: number }>()
    for (const a of assignments) {
      const existing = map.get(a.staffMemberId)
      const ms = new Date(a.endDatetime).getTime() - new Date(a.startDatetime).getTime()
      const mins = Math.round(ms / 60000)
      if (existing) { existing.shifts += 1; existing.minutes += mins }
      else map.set(a.staffMemberId, { shifts: 1, minutes: mins })
    }
    return map
  }, [assignments])

  function fmtStaffStats(staffMemberId: string) {
    const s = staffStats.get(staffMemberId)
    if (!s) return null
    const h = Math.floor(s.minutes / 60)
    const m = s.minutes % 60
    const hrs = m === 0 ? `${h}h` : `${h}h ${m}m`
    return `${s.shifts} shift${s.shifts !== 1 ? 's' : ''} · ${hrs}`
  }

  useEffect(() => {
    if (!localDate) {
      setEligible(null)
      return
    }

    if (positionId) {
      setLoading(true)
      setError(null)
      checkPositionEligibilityServerFn({ data: { orgSlug, positionId, asOfDate: localDate } })
        .then((result) => {
          if (result.success) {
            setEligible(result.eligible.map((e) => ({
              ...e,
              isScheduledAdjacent: e.isScheduledAdjacent || adjacentIds.has(e.staffMemberId),
            })))
          } else {
            setError('Failed to load eligible staff.')
          }
        })
        .catch(() => setError('Failed to load eligible staff.'))
        .finally(() => setLoading(false))
    } else {
      setEligible(
        allStaff.map((s) => ({
          staffMemberId: s.id,
          name: s.name,
          rankName: null,
          certsSummary: '',
          hasExpiringCerts: false,
          constraintType: null,
          isScheduledAdjacent: adjacentIds.has(s.id),
        })),
      )
    }
  }, [localDate, positionId, orgSlug, allStaff, adjacentIds])

  const preferred = eligible?.filter((s) => !scheduledIds.has(s.staffMemberId) && s.constraintType === 'preferred') ?? []
  const available = eligible?.filter((s) => !scheduledIds.has(s.staffMemberId) && s.constraintType === null && !s.isScheduledAdjacent) ?? []
  const scheduledAdjacent = eligible?.filter((s) => !scheduledIds.has(s.staffMemberId) && s.constraintType === null && s.isScheduledAdjacent) ?? []
  const notPreferred = eligible?.filter((s) => !scheduledIds.has(s.staffMemberId) && s.constraintType === 'not_preferred') ?? []
  const unavailable = eligible?.filter((s) => !scheduledIds.has(s.staffMemberId) && (s.constraintType === 'time_off' || s.constraintType === 'unavailable')) ?? []
  const alreadyScheduled = eligible?.filter((s) => scheduledIds.has(s.staffMemberId)) ?? []
  const selectableCount = preferred.length + available.length + scheduledAdjacent.length + notPreferred.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-navy-700">Find Available Staff</h2>
            {positionName && <p className="text-xs text-gray-500 mt-0.5">Position: {positionName}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <label className="block text-xs font-medium text-gray-600 mb-1">Target Date</label>
          <input
            type="date"
            value={localDate}
            onChange={(e) => { setLocalDate(e.target.value); setEligible(null) }}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
          />
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {!localDate ? (
            <p className="text-sm text-gray-400 text-center py-6">Select a date to see available staff.</p>
          ) : loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : error ? (
            <p className="text-sm text-danger text-center py-6">{error}</p>
          ) : eligible !== null && selectableCount === 0 && unavailable.length === 0 && alreadyScheduled.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No staff found.</p>
          ) : eligible !== null ? (
            <>
              {preferred.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                    Preferred ({preferred.length})
                  </p>
                  <div className="space-y-1.5">
                    {preferred.map((s) => (
                      <button
                        key={s.staffMemberId}
                        type="button"
                        onClick={() => onSelect(s.staffMemberId)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-green-300 bg-green-50 hover:border-green-500 hover:bg-green-100 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-green-800">{s.name}</p>
                            {(s.rankName || s.certsSummary) && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {[s.rankName, s.certsSummary].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {fmtStaffStats(s.staffMemberId) && (
                              <p className="text-xs text-gray-400 mt-0.5">{fmtStaffStats(s.staffMemberId)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {s.hasExpiringCerts && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warning-bg text-warning text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                                <AlertTriangle className="w-3 h-3" />
                                Expiring
                              </span>
                            )}
                            {s.isScheduledAdjacent && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                                <CalendarDays className="w-3 h-3" />
                                Adjacent
                              </span>
                            )}
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                              <Star className="w-3 h-3" />
                              Preferred
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {available.length > 0 && (
                <div className={preferred.length > 0 ? 'mt-4' : ''}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                    Available ({available.length})
                  </p>
                  <div className="space-y-1.5">
                    {available.map((s) => (
                      <button
                        key={s.staffMemberId}
                        type="button"
                        onClick={() => onSelect(s.staffMemberId)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-navy-400 hover:bg-navy-50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-navy-700">{s.name}</p>
                            {(s.rankName || s.certsSummary) && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {[s.rankName, s.certsSummary].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {fmtStaffStats(s.staffMemberId) && (
                              <p className="text-xs text-gray-400 mt-0.5">{fmtStaffStats(s.staffMemberId)}</p>
                            )}
                          </div>
                          {s.hasExpiringCerts && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warning-bg text-warning text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                              <AlertTriangle className="w-3 h-3" />
                              Expiring
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {scheduledAdjacent.length > 0 && (
                <div className={preferred.length + available.length > 0 ? 'mt-4' : ''}>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                    Scheduled Adjacent ({scheduledAdjacent.length})
                  </p>
                  <div className="space-y-1.5">
                    {scheduledAdjacent.map((s) => (
                      <button
                        key={s.staffMemberId}
                        type="button"
                        onClick={() => onSelect(s.staffMemberId)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-amber-300 bg-amber-50 hover:border-amber-500 hover:bg-amber-100 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-amber-800">{s.name}</p>
                            {(s.rankName || s.certsSummary) && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {[s.rankName, s.certsSummary].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {fmtStaffStats(s.staffMemberId) && (
                              <p className="text-xs text-gray-400 mt-0.5">{fmtStaffStats(s.staffMemberId)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {s.hasExpiringCerts && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warning-bg text-warning text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                                <AlertTriangle className="w-3 h-3" />
                                Expiring
                              </span>
                            )}
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                              <CalendarDays className="w-3 h-3" />
                              Adjacent
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {notPreferred.length > 0 && (
                <div className={preferred.length + available.length + scheduledAdjacent.length > 0 ? 'mt-4' : ''}>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                    Not Preferred ({notPreferred.length})
                  </p>
                  <div className="space-y-1.5">
                    {notPreferred.map((s) => (
                      <button
                        key={s.staffMemberId}
                        type="button"
                        onClick={() => onSelect(s.staffMemberId)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-amber-300 bg-amber-50 hover:border-amber-500 hover:bg-amber-100 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-amber-800">{s.name}</p>
                            {(s.rankName || s.certsSummary) && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {[s.rankName, s.certsSummary].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {fmtStaffStats(s.staffMemberId) && (
                              <p className="text-xs text-gray-400 mt-0.5">{fmtStaffStats(s.staffMemberId)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {s.hasExpiringCerts && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warning-bg text-warning text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                                <AlertTriangle className="w-3 h-3" />
                                Expiring
                              </span>
                            )}
                            {s.isScheduledAdjacent && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                                <CalendarDays className="w-3 h-3" />
                                Adjacent
                              </span>
                            )}
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                              <ThumbsDown className="w-3 h-3" />
                              Not Preferred
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {unavailable.length > 0 && (
                <div className={selectableCount > 0 ? 'mt-4' : ''}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                    Unavailable ({unavailable.length})

                  </p>
                  <div className="space-y-1.5">
                    {unavailable.map((s) => (
                      <div
                        key={s.staffMemberId}
                        className="px-3 py-2.5 rounded-lg border border-gray-100 bg-gray-50 opacity-60"
                      >
                        <p className="text-sm font-medium text-gray-500">{s.name}</p>
                        {(s.rankName || s.certsSummary) && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {[s.rankName, s.certsSummary].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {fmtStaffStats(s.staffMemberId) && (
                          <p className="text-xs text-gray-400 mt-0.5">{fmtStaffStats(s.staffMemberId)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {alreadyScheduled.length > 0 && (
                <div className={selectableCount + unavailable.length > 0 ? 'mt-4' : ''}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                    Already Scheduled ({alreadyScheduled.length})
                  </p>
                  <div className="space-y-1.5">
                    {alreadyScheduled.map((s) => (
                      <div
                        key={s.staffMemberId}
                        className="px-3 py-2.5 rounded-lg border border-gray-100 bg-gray-50 opacity-60"
                      >
                        <p className="text-sm font-medium text-gray-500">{s.name}</p>
                        {(s.rankName || s.certsSummary) && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {[s.rankName, s.certsSummary].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {fmtStaffStats(s.staffMemberId) && (
                          <p className="text-xs text-gray-400 mt-0.5">{fmtStaffStats(s.staffMemberId)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
