import { useState } from 'react'
import { createFileRoute, Link, useNavigate, useRouteContext } from '@tanstack/react-router'
import { Plus, Trash2, Calendar } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { ScheduleView } from '@/lib/schedule.types'
import type { PlatoonView } from '@/lib/platoon.types'
import {
  listSchedulesServerFn,
  createScheduleServerFn,
  deleteScheduleServerFn,
  populateFromPlatoonsServerFn,
} from '@/server/schedule'
import { listPlatoonsServerFn } from '@/server/platoons'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/schedules/')({
  head: () => ({
    meta: [{ title: 'Schedules | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const [schedulesResult, platoonsResult] = await Promise.all([
      listSchedulesServerFn({ data: { orgSlug: params.orgSlug } }),
      listPlatoonsServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      schedules: schedulesResult.success ? schedulesResult.schedules : [],
      platoons: platoonsResult.success ? platoonsResult.platoons : [],
    }
  },
  component: SchedulesPage,
})

function statusBadge(status: ScheduleView['status']) {
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

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}

function SchedulesPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { schedules: initialSchedules, platoons } = Route.useLoaderData()
  const navigate = useNavigate()

  const [schedules, setSchedules] = useState<ScheduleView[]>(initialSchedules)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)

  const [populateEnabled, setPopulateEnabled] = useState(platoons.length > 0)
  const [selectedPlatoonIds, setSelectedPlatoonIds] = useState<string[]>([])

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null)

  const canEdit = canDo(userRole, 'create-edit-schedules')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    if (!name.trim()) { setCreateError('Name is required.'); return }
    if (!startDate || !endDate) { setCreateError('Start and end dates are required.'); return }
    if (endDate < startDate) { setCreateError('End date must be on or after start date.'); return }

    setCreateBusy(true)
    try {
      const result = await createScheduleServerFn({
        data: { orgSlug: org.slug, name: name.trim(), startDate, endDate },
      })
      if (result.success) {
        if (populateEnabled) {
          await populateFromPlatoonsServerFn({
            data: { orgSlug: org.slug, scheduleId: result.schedule.id, platoonIds: selectedPlatoonIds },
          })
          await navigate({
            to: '/orgs/$orgSlug/schedules/$scheduleId',
            params: { orgSlug: org.slug, scheduleId: result.schedule.id },
          })
        } else {
          setSchedules((prev) => [result.schedule, ...prev])
          setName(''); setStartDate(''); setEndDate('')
          setShowCreateForm(false)
        }
      } else {
        const msgs: Record<string, string> = {
          FORBIDDEN: 'You do not have permission to create schedules.',
          VALIDATION_ERROR: 'Please check the form fields and try again.',
        }
        setCreateError(msgs[result.error] ?? 'An error occurred.')
      }
    } finally {
      setCreateBusy(false)
    }
  }

  async function handleDelete(scheduleId: string) {
    setDeleteBusy(scheduleId)
    try {
      const result = await deleteScheduleServerFn({
        data: { orgSlug: org.slug, scheduleId },
      })
      if (result.success) {
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId))
        setConfirmDelete(null)
      }
    } finally {
      setDeleteBusy(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">{schedules.length} schedule{schedules.length !== 1 ? 's' : ''}</p>
        {canEdit && (
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Schedule
          </button>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && canEdit && (
        <form onSubmit={handleCreate} className="mb-6 p-5 rounded-lg border border-gray-200 bg-white">
          <h2 className="text-base font-semibold text-navy-700 mb-4">New schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Week of March 10"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Start Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                End Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
          </div>
          {platoons.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={populateEnabled}
                  onChange={(e) => setPopulateEnabled(e.target.checked)}
                  className="rounded border-gray-300 text-navy-700 focus:ring-navy-700"
                />
                <span className="text-sm font-medium text-gray-700">Auto-populate from platoons</span>
              </label>
              {populateEnabled && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-500">Leave all unchecked to include every platoon.</p>
                  {platoons.map((p: PlatoonView) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPlatoonIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPlatoonIds((prev) => [...prev, p.id])
                          } else {
                            setSelectedPlatoonIds((prev) => prev.filter((id) => id !== p.id))
                          }
                        }}
                        className="rounded border-gray-300 text-navy-700 focus:ring-navy-700"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-gray-500">{p.shiftLabel}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-gray-500">{p.shiftStartTime} → {p.shiftEndTime}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-gray-500">{p.memberCount} member{p.memberCount !== 1 ? 's' : ''}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {createError && <p className="mt-3 text-sm text-danger">{createError}</p>}
          <div className="flex items-center gap-3 mt-4">
            <button
              type="submit"
              disabled={createBusy}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors"
            >
              {createBusy ? (populateEnabled ? 'Creating & populating…' : 'Creating…') : 'Create schedule'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); setCreateError(null) }}
              className="px-4 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Schedules Table */}
      {schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">No schedules yet.</p>
          {canEdit && (
            <p className="text-sm mt-1">Click &ldquo;Create Schedule&rdquo; to get started.</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Date Range</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Assignments</th>
                {canEdit && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => {
                const confirming = confirmDelete === schedule.id
                const busy = deleteBusy === schedule.id

                return (
                  <tr key={schedule.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        to="/orgs/$orgSlug/schedules/$scheduleId"
                        params={{ orgSlug: org.slug, scheduleId: schedule.id }}
                        className="text-navy-700 font-medium hover:underline"
                      >
                        {schedule.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDateRange(schedule.startDate, schedule.endDate)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(schedule.status)}</td>
                    <td className="px-4 py-3 text-gray-500">{schedule.assignmentCount}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {confirming ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500">Delete?</span>
                              <button
                                onClick={() => handleDelete(schedule.id)}
                                disabled={busy}
                                className="px-2 py-1 bg-danger hover:opacity-90 disabled:opacity-50 text-white rounded-md text-xs"
                              >
                                {busy ? '…' : 'Yes'}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-xs"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(schedule.id)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-danger-bg text-gray-500 hover:text-danger rounded-md text-xs transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
