import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { ScheduleView, ShiftAssignmentView } from '@/lib/schedule.types'
import { getDatesInRange, addDays, formatTime } from '@/lib/date-utils'

type ViewMode = '1w' | '2w' | 'month'

interface ScheduleCalendarProps {
  schedule: ScheduleView
  assignments: ShiftAssignmentView[]
  onEditAssignment?: (a: ShiftAssignmentView) => void
  onQuickAdd?: (date: string) => void
}

const PILL_COLORS = [
  'border-l-blue-600',
  'border-l-emerald-600',
  'border-l-amber-600',
  'border-l-purple-600',
  'border-l-rose-600',
  'border-l-cyan-600',
]

function hashColor(str: string | null): string {
  if (!str) return 'border-l-navy-700'
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return PILL_COLORS[Math.abs(hash) % PILL_COLORS.length]
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getMaxPills(mode: ViewMode): number {
  if (mode === '1w') return 8
  if (mode === '2w') return 5
  return 3
}

function getMinHeight(mode: ViewMode): string {
  if (mode === '1w') return 'min-h-[200px]'
  if (mode === '2w') return 'min-h-[140px]'
  return 'min-h-[100px]'
}

function alignToSunday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(dateStr, -dow)
}

function getVisibleDates(viewStart: string, mode: ViewMode): string[] {
  const sunday = alignToSunday(viewStart)
  if (mode === '1w') return getDatesInRange(sunday, addDays(sunday, 6))
  if (mode === '2w') return getDatesInRange(sunday, addDays(sunday, 13))
  // Month: get the month of viewStart, pad to full weeks
  const [y, m] = viewStart.split('-').map(Number)
  const firstOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lastOfMonth = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const start = alignToSunday(firstOfMonth)
  const [ey, em, ed] = lastOfMonth.split('-').map(Number)
  const endDow = new Date(Date.UTC(ey, em - 1, ed)).getUTCDay()
  const end = endDow === 6 ? lastOfMonth : addDays(lastOfMonth, 6 - endDow)
  return getDatesInRange(start, end)
}

function getPeriodLabel(viewStart: string, mode: ViewMode): string {
  if (mode === 'month') {
    const [y, m] = viewStart.split('-').map(Number)
    const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return monthName
  }
  const sunday = alignToSunday(viewStart)
  const days = mode === '1w' ? 6 : 13
  const endDate = addDays(sunday, days)
  const s = new Date(sunday + 'T00:00:00Z')
  const e = new Date(endDate + 'T00:00:00Z')
  const sMonth = s.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const eMonth = e.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const sYear = s.getUTCFullYear()
  const eYear = e.getUTCFullYear()
  if (sYear !== eYear) {
    return `${sMonth} ${s.getUTCDate()}, ${sYear} – ${eMonth} ${e.getUTCDate()}, ${eYear}`
  }
  if (sMonth !== eMonth) {
    return `${sMonth} ${s.getUTCDate()} – ${eMonth} ${e.getUTCDate()}, ${sYear}`
  }
  return `${sMonth} ${s.getUTCDate()}–${e.getUTCDate()}, ${sYear}`
}

function navigateView(viewStart: string, mode: ViewMode, direction: 1 | -1): string {
  if (mode === '1w') return addDays(viewStart, direction * 7)
  if (mode === '2w') return addDays(viewStart, direction * 14)
  const [y, m] = viewStart.split('-').map(Number)
  const newMonth = m + direction
  const newDate = new Date(Date.UTC(y, newMonth - 1, 1))
  return newDate.toISOString().slice(0, 10)
}

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function groupByDate(assignments: ShiftAssignmentView[]): Record<string, ShiftAssignmentView[]> {
  const groups: Record<string, ShiftAssignmentView[]> = {}
  for (const a of assignments) {
    const date = a.startDatetime.slice(0, 10)
    if (!groups[date]) groups[date] = []
    groups[date].push(a)
  }
  return groups
}

// --- Sub-components ---

function AssignmentPill({ assignment, onClick }: { assignment: ShiftAssignmentView; onClick?: () => void }) {
  const colorClass = hashColor(assignment.position)
  const timeStr = `${formatTime(assignment.startDatetime)}–${formatTime(assignment.endDatetime)}`
  const label = [assignment.staffMemberName, timeStr, assignment.position].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left text-xs px-1.5 py-0.5 rounded bg-gray-50 hover:bg-gray-100 border-l-2 ${colorClass} truncate transition-colors`}
      title={label}
    >
      <span className="font-medium">{assignment.staffMemberName}</span>
      <span className="text-gray-400"> · {timeStr}</span>
      {assignment.position && <span className="text-gray-400"> · {assignment.position}</span>}
    </button>
  )
}

function CalendarDayCell({
  date,
  assignments,
  isInRange,
  isToday,
  isCurrentMonth,
  maxPills,
  minHeightClass,
  onEditAssignment,
  onQuickAdd,
}: {
  date: string
  assignments: ShiftAssignmentView[]
  isInRange: boolean
  isToday: boolean
  isCurrentMonth: boolean
  maxPills: number
  minHeightClass: string
  onEditAssignment?: (a: ShiftAssignmentView) => void
  onQuickAdd?: (date: string) => void
}) {
  const dayNum = parseInt(date.split('-')[2], 10)
  const overflow = assignments.length - maxPills
  const visible = overflow > 0 ? assignments.slice(0, maxPills) : assignments

  return (
    <div
      className={`border-b border-r border-gray-200 p-1.5 ${minHeightClass} flex flex-col group relative ${
        !isInRange ? 'bg-gray-50/60' : ''
      } ${!isCurrentMonth ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-xs font-medium leading-none ${
            isToday
              ? 'bg-red-700 text-white w-6 h-6 rounded-full flex items-center justify-center'
              : isInRange
                ? 'text-gray-700'
                : 'text-gray-400'
          }`}
        >
          {dayNum}
        </span>
        {onQuickAdd && isInRange && (
          <button
            type="button"
            onClick={() => onQuickAdd(date)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-navy-700 hover:bg-white rounded transition-all"
            title="Add assignment"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 space-y-0.5 overflow-hidden">
        {visible.map((a) => (
          <AssignmentPill
            key={a.id}
            assignment={a}
            onClick={onEditAssignment ? () => onEditAssignment(a) : undefined}
          />
        ))}
        {overflow > 0 && (
          <p className="text-xs text-gray-400 pl-1.5 font-medium">+{overflow} more</p>
        )}
      </div>
    </div>
  )
}

function CalendarToolbar({
  viewMode,
  viewStart,
  onModeChange,
  onNavigate,
  onToday,
}: {
  viewMode: ViewMode
  viewStart: string
  onModeChange: (mode: ViewMode) => void
  onNavigate: (direction: 1 | -1) => void
  onToday: () => void
}) {
  const label = getPeriodLabel(viewStart, viewMode)

  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate(-1)}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate(1)}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          Today
        </button>
        <span className="text-sm font-semibold text-navy-700 ml-1">{label}</span>
      </div>
      <div className="flex items-center bg-gray-100 rounded-md p-0.5">
        {([['1w', '1W'], ['2w', '2W'], ['month', 'Mo']] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onModeChange(mode)}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              viewMode === mode
                ? 'bg-white text-navy-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Main Component ---

export function ScheduleCalendar({ schedule, assignments, onEditAssignment, onQuickAdd }: ScheduleCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('2w')
  const [viewStart, setViewStart] = useState(() => {
    const today = todayStr()
    // If today is within the schedule range, start from today; otherwise start from schedule start
    if (today >= schedule.startDate && today <= schedule.endDate) return today
    return schedule.startDate
  })

  const visibleDates = useMemo(() => getVisibleDates(viewStart, viewMode), [viewStart, viewMode])
  const grouped = useMemo(() => groupByDate(assignments), [assignments])

  const scheduleStartSet = schedule.startDate
  const scheduleEndSet = schedule.endDate
  const today = todayStr()

  // For month view, determine the current month
  const [, viewMonth] = viewStart.split('-').map(Number)

  const maxPills = getMaxPills(viewMode)
  const minHeightClass = getMinHeight(viewMode)

  function handleNavigate(direction: 1 | -1) {
    setViewStart((prev) => navigateView(prev, viewMode, direction))
  }

  function handleToday() {
    setViewStart(todayStr())
  }

  function handleModeChange(mode: ViewMode) {
    setViewMode(mode)
  }

  const weeks: string[][] = []
  for (let i = 0; i < visibleDates.length; i += 7) {
    weeks.push(visibleDates.slice(i, i + 7))
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-gray-200">
        <CalendarToolbar
          viewMode={viewMode}
          viewStart={viewStart}
          onModeChange={handleModeChange}
          onNavigate={handleNavigate}
          onToday={handleToday}
        />
      </div>
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide py-2 border-r border-gray-200 last:border-r-0"
            style={{ fontFamily: 'var(--font-condensed)' }}
          >
            {day}
          </div>
        ))}
      </div>
      <div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((date) => {
              const isInRange = date >= scheduleStartSet && date <= scheduleEndSet
              const isToday = date === today
              const [, dm] = date.split('-').map(Number)
              const isCurrentMonth = viewMode === 'month' ? dm === viewMonth : true
              const dayAssignments = grouped[date] ?? []

              return (
                <CalendarDayCell
                  key={date}
                  date={date}
                  assignments={dayAssignments}
                  isInRange={isInRange}
                  isToday={isToday}
                  isCurrentMonth={isCurrentMonth}
                  maxPills={maxPills}
                  minHeightClass={minHeightClass}
                  onEditAssignment={onEditAssignment}
                  onQuickAdd={onQuickAdd}
                />
              )
            })}
          </div>
        ))}
      </div>
      {assignments.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">
          No assignments yet. Use the Add Assignment button to get started.
        </div>
      )}
    </div>
  )
}
