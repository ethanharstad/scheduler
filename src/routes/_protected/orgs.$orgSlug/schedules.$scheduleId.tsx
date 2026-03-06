import { useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate, useRouteContext } from '@tanstack/react-router'
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, ChevronDown, Repeat } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { ScheduleView, ScheduleStatus, ShiftAssignmentView, RecurrenceMode } from '@/lib/schedule.types'
import type { StaffMemberView } from '@/lib/staff.types'
import {
  getScheduleServerFn,
  updateScheduleServerFn,
  deleteScheduleServerFn,
  createAssignmentServerFn,
  createRecurringAssignmentsServerFn,
  updateAssignmentServerFn,
  deleteAssignmentServerFn,
} from '@/server/schedule'
import { listStaffServerFn } from '@/server/staff'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/schedules/$scheduleId',
)({
  head: () => ({
    meta: [{ title: 'Schedule Detail | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const [scheduleResult, staffResult] = await Promise.all([
      getScheduleServerFn({ data: { orgSlug: params.orgSlug, scheduleId: params.scheduleId } }),
      listStaffServerFn({ data: { orgSlug: params.orgSlug } }),
    ])

    if (!scheduleResult.success) {
      return { schedule: null, assignments: [], staffMembers: [] }
    }

    return {
      schedule: scheduleResult.schedule,
      assignments: scheduleResult.assignments,
      staffMembers: staffResult.success ? staffResult.members.filter((m) => m.status !== 'removed') : [],
    }
  },
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

function formatTime(datetime: string) {
  const d = new Date(datetime)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDuration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function formatDate(datetime: string) {
  const d = new Date(datetime)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setDate(current.getDate() + 1)
  }
  return dates
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

function ScheduleDetailPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const navigate = useNavigate()
  const loaderData = Route.useLoaderData()

  const canEdit = canDo(userRole, 'create-edit-schedules')

  if (!loaderData.schedule) {
    return (
      <div className="max-w-5xl mx-auto">
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
  const [addNotes, setAddNotes] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
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
  const [editAssignNotes, setEditAssignNotes] = useState('')
  const [editAssignBusy, setEditAssignBusy] = useState(false)

  // Delete states
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState(false)
  const [deleteScheduleBusy, setDeleteScheduleBusy] = useState(false)
  const [confirmDeleteAssignment, setConfirmDeleteAssignment] = useState<string | null>(null)
  const [deleteAssignmentBusy, setDeleteAssignmentBusy] = useState<string | null>(null)

  const [statusBusy, setStatusBusy] = useState(false)

  const addFormRef = useRef<HTMLFormElement>(null)

  function quickAddForDate(date: string) {
    resetAddForm()
    setAddRecurring(false)
    setAddStartDatetime(`${date}T08:00`)
    setAddEndDatetime(`${date}T16:00`)
    setShowAddForm(true)
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function handleUpdateSchedule(e: React.FormEvent) {
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
    setAddPosition(''); setAddNotes(''); setAddRecurring(false)
    setShowAddForm(false)
  }

  function toggleDay(day: number) {
    setAddDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  async function handleAddAssignment(e: React.FormEvent) {
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
          setAssignments((prev) =>
            [...prev, ...result.assignments].sort((a, b) => a.startDatetime.localeCompare(b.startDatetime)),
          )
          setSchedule((s) => ({ ...s, assignmentCount: s.assignmentCount + result.assignments.length }))
          resetAddForm()
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
            notes: addNotes.trim() || undefined,
          },
        })
        if (result.success) {
          setAssignments((prev) =>
            [...prev, result.assignment].sort((a, b) => a.startDatetime.localeCompare(b.startDatetime)),
          )
          setSchedule((s) => ({ ...s, assignmentCount: s.assignmentCount + 1 }))
          resetAddForm()
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
                    notes: editAssignNotes.trim() || null,
                  }
                : a,
            )
            .sort((a, b) => a.startDatetime.localeCompare(b.startDatetime)),
        )
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
    <div className="max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        to="/orgs/$orgSlug/schedules"
        params={{ orgSlug: org.slug }}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to schedules
      </Link>

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
            <p className="text-sm text-gray-500 mt-1">
              {new Date(schedule.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {' – '}
              {new Date(schedule.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {schedule.createdByName && <> &middot; Created by {schedule.createdByName}</>}
            </p>
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
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Position</label>
                  <input
                    type="text"
                    value={addPosition}
                    onChange={(e) => setAddPosition(e.target.value)}
                    placeholder="e.g. Engine 1, Medic 2"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
                  />
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

      {/* Assignments grouped by date */}
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
              {sortedDates.map((date) => (
                <>
                  <tr key={`date-${date}`} className="border-b border-gray-200 bg-gray-50/50">
                    <td colSpan={canEdit ? 5 : 4} className="px-4 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>
                          {formatDate(date + 'T00:00:00')}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => quickAddForDate(date)}
                            className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-navy-700 hover:bg-white rounded transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {grouped[date].length === 0 && (
                    <tr key={`empty-${date}`} className="border-b border-gray-200">
                      <td colSpan={canEdit ? 5 : 4} className="px-4 py-2 text-gray-400 text-xs italic">
                        No assignments
                      </td>
                    </tr>
                  )}
                  {grouped[date].map((a) => {
                    if (editingAssignment === a.id && canEdit) {
                      return (
                        <tr key={a.id} className="border-b border-gray-200 last:border-0 bg-gray-50">
                          <td className="px-4 py-2">
                            <div className="relative">
                              <select
                                value={editAssignStaffId}
                                onChange={(e) => setEditAssignStaffId(e.target.value)}
                                className="w-full appearance-none px-2 py-1 bg-white border border-gray-300 rounded-md text-gray-900 text-xs focus:outline-none focus:border-navy-500"
                              >
                                {staffMembers.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-1 top-1.5 w-3 h-3 text-gray-400 pointer-events-none" />
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              <input type="datetime-local" value={editAssignStart} onChange={(e) => setEditAssignStart(e.target.value)} className="px-1 py-1 bg-white border border-gray-300 rounded-md text-xs focus:outline-none focus:border-navy-500 w-full" />
                              <span className="text-gray-400 shrink-0">–</span>
                              <input type="datetime-local" value={editAssignEnd} onChange={(e) => setEditAssignEnd(e.target.value)} className="px-1 py-1 bg-white border border-gray-300 rounded-md text-xs focus:outline-none focus:border-navy-500 w-full" />
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <input type="text" value={editAssignPosition} onChange={(e) => setEditAssignPosition(e.target.value)} className="w-full px-2 py-1 bg-white border border-gray-300 rounded-md text-xs focus:outline-none focus:border-navy-500" />
                          </td>
                          <td className="px-4 py-2">
                            <input type="text" value={editAssignNotes} onChange={(e) => setEditAssignNotes(e.target.value)} className="w-full px-2 py-1 bg-white border border-gray-300 rounded-md text-xs focus:outline-none focus:border-navy-500" />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => void handleUpdateAssignment(a.id)} disabled={editAssignBusy} className="p-1 text-success hover:bg-success-bg rounded transition-colors">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingAssignment(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    const confirming = confirmDeleteAssignment === a.id
                    const busy = deleteAssignmentBusy === a.id

                    return (
                      <tr key={a.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-900 font-medium truncate">{a.staffMemberName}</td>
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                          {formatTime(a.startDatetime)} – {formatTime(a.endDatetime)}
                          <span className="ml-1.5 text-xs text-gray-400">({formatDuration(a.startDatetime, a.endDatetime)})</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 truncate">{a.position ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-500 truncate">{a.notes ?? '—'}</td>
                        {canEdit && (
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => startEditAssignment(a)} className="p-1 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
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
                </>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  )
}
