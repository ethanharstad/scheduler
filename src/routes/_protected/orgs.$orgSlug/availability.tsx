import { useState } from 'react'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { PlusCircle, Pencil, Trash2, Check, X } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { ConstraintType, ConstraintView } from '@/lib/constraint.types'
import type { StaffMemberView } from '@/lib/staff.types'
import {
  listConstraintsServerFn,
  listPendingTimeOffServerFn,
  createConstraintServerFn,
  updateConstraintServerFn,
  deleteConstraintServerFn,
  reviewConstraintServerFn,
} from '@/server/constraints'
import { listStaffServerFn } from '@/server/staff'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/availability')({
  head: () => ({
    meta: [{ title: 'Availability | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const [constraintsResult, pendingResult, staffResult] = await Promise.all([
      listConstraintsServerFn({ data: { orgSlug: params.orgSlug } }),
      listPendingTimeOffServerFn({ data: { orgSlug: params.orgSlug } }),
      listStaffServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      constraints: constraintsResult.success ? constraintsResult.constraints : [],
      noStaffRecord: !constraintsResult.success && constraintsResult.error === 'NO_STAFF_RECORD',
      pendingTimeOff: pendingResult.success ? pendingResult.constraints : [],
      canReview: pendingResult.success,
      staffList: staffResult.success ? staffResult.members : [],
    }
  },
  component: AvailabilityPage,
})

const TYPE_LABELS: Record<ConstraintType, string> = {
  time_off: 'Time Off',
  unavailable: 'Unavailable',
  preferred: 'Preferred',
  not_preferred: 'Not Preferred',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function TypeBadge({ type }: { type: ConstraintType }) {
  const cls =
    type === 'time_off' ? 'bg-warning-bg text-warning'
    : type === 'unavailable' ? 'bg-danger-bg text-danger'
    : type === 'preferred' ? 'bg-success-bg text-success'
    : 'bg-gray-100 text-gray-600'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${cls}`}
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {TYPE_LABELS[type]}
    </span>
  )
}

function StatusBadge({ status }: { status: ConstraintView['status'] }) {
  const cls =
    status === 'pending' ? 'bg-warning-bg text-warning'
    : status === 'approved' ? 'bg-success-bg text-success'
    : 'bg-danger-bg text-danger'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${cls}`}
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDateRange(start: string, end: string): string {
  return `${formatDatetime(start)} – ${formatDatetime(end)}`
}

interface FormState {
  type: ConstraintType
  startDatetime: string
  endDatetime: string
  recurring: boolean
  daysOfWeek: number[]
  reason: string
}

const DEFAULT_FORM: FormState = {
  type: 'time_off',
  startDatetime: '',
  endDatetime: '',
  recurring: false,
  daysOfWeek: [],
  reason: '',
}

function constraintToForm(c: ConstraintView): FormState {
  return {
    type: c.type,
    startDatetime: c.startDatetime.slice(0, 16), // datetime-local input format
    endDatetime: c.endDatetime.slice(0, 16),
    recurring: c.daysOfWeek !== null,
    daysOfWeek: c.daysOfWeek ?? [],
    reason: c.reason ?? '',
  }
}

function AvailabilityPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { params } = Route.useMatch()
  const loaderData = Route.useLoaderData()

  const [constraints, setConstraints] = useState<ConstraintView[]>(loaderData.constraints)
  const [pendingTimeOff, setPendingTimeOff] = useState<ConstraintView[]>(loaderData.pendingTimeOff)
  const [noStaffRecord, setNoStaffRecord] = useState(loaderData.noStaffRecord)

  const canManage = canDo(userRole, 'create-edit-schedules')
  const canReview = loaderData.canReview && canDo(userRole, 'approve-time-off')

  // Staff picker (managers+)
  const [selectedStaffId, setSelectedStaffId] = useState<string | undefined>(undefined)
  const [staffLoading, setStaffLoading] = useState(false)

  // Add / edit form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [formBusy, setFormBusy] = useState(false)

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Review busy
  const [reviewBusy, setReviewBusy] = useState<string | null>(null)

  async function handleStaffChange(staffMemberId: string) {
    setSelectedStaffId(staffMemberId || undefined)
    setStaffLoading(true)
    setShowForm(false)
    setEditingId(null)
    try {
      const result = await listConstraintsServerFn({
        data: { orgSlug: params.orgSlug, staffMemberId: staffMemberId || undefined },
      })
      if (result.success) {
        setConstraints(result.constraints)
        setNoStaffRecord(false)
      } else if (result.error === 'NO_STAFF_RECORD') {
        setConstraints([])
        setNoStaffRecord(true)
      }
    } finally {
      setStaffLoading(false)
    }
  }

  function openAdd() {
    setEditingId(null)
    setForm(DEFAULT_FORM)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(c: ConstraintView) {
    setEditingId(c.id)
    setForm(constraintToForm(c))
    setFormError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter((d) => d !== day)
        : [...f.daysOfWeek, day].sort((a, b) => a - b),
    }))
  }

  async function handleSubmit() {
    if (!form.startDatetime || !form.endDatetime) {
      setFormError('Start and end datetime are required.')
      return
    }
    if (form.endDatetime <= form.startDatetime) {
      setFormError('End must be after start.')
      return
    }
    setFormBusy(true)
    setFormError(null)
    try {
      if (editingId) {
        const result = await updateConstraintServerFn({
          data: {
            orgSlug: params.orgSlug,
            constraintId: editingId,
            startDatetime: form.startDatetime,
            endDatetime: form.endDatetime,
            daysOfWeek: form.recurring ? form.daysOfWeek : null,
            reason: form.reason || null,
          },
        })
        if (!result.success) {
          setFormError(result.error === 'CONSTRAINT_REVIEWED' ? 'This time-off request has already been reviewed.' : result.error)
          return
        }
        setConstraints((prev) => prev.map((c) => (c.id === editingId ? result.constraint : c)))
      } else {
        const result = await createConstraintServerFn({
          data: {
            orgSlug: params.orgSlug,
            staffMemberId: selectedStaffId,
            type: form.type,
            startDatetime: form.startDatetime,
            endDatetime: form.endDatetime,
            daysOfWeek: form.recurring ? form.daysOfWeek : undefined,
            reason: form.reason || undefined,
          },
        })
        if (!result.success) {
          setFormError(result.error)
          return
        }
        setConstraints((prev) => [...prev, result.constraint])
      }
      setShowForm(false)
      setEditingId(null)
    } finally {
      setFormBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleteBusy(true)
    try {
      const result = await deleteConstraintServerFn({
        data: { orgSlug: params.orgSlug, constraintId: id },
      })
      if (result.success) {
        setConstraints((prev) => prev.filter((c) => c.id !== id))
        setConfirmDelete(null)
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleReview(constraintId: string, decision: 'approved' | 'denied') {
    setReviewBusy(constraintId)
    try {
      const result = await reviewConstraintServerFn({
        data: { orgSlug: params.orgSlug, constraintId, decision },
      })
      if (result.success) {
        setPendingTimeOff((prev) => prev.filter((c) => c.id !== constraintId))
        // If currently viewing the same staff member's constraints, update them
        setConstraints((prev) =>
          prev.map((c) => (c.id === constraintId ? result.constraint : c)),
        )
      }
    } finally {
      setReviewBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-sans)' }}>
            Availability
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{org.name}</p>
        </div>
      </div>

      {/* Pending Time-Off Requests */}
      {canReview && pendingTimeOff.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-navy-700">Pending Time-Off Requests</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Staff Member</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Date Range</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Reason</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendingTimeOff.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-navy-700">{c.staffMemberName}</td>
                  <td className="px-6 py-3 text-gray-600">{formatDateRange(c.startDatetime, c.endDatetime)}</td>
                  <td className="px-6 py-3 text-gray-500">{c.reason ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => void handleReview(c.id, 'approved')}
                        disabled={reviewBusy === c.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-success-bg text-success hover:opacity-80 disabled:opacity-50 transition-opacity"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => void handleReview(c.id, 'denied')}
                        disabled={reviewBusy === c.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-danger-bg text-danger hover:opacity-80 disabled:opacity-50 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" /> Deny
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Staff Picker */}
      {canManage && (
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Viewing constraints for
          </label>
          <select
            value={selectedStaffId ?? ''}
            onChange={(e) => void handleStaffChange(e.target.value)}
            className="block w-72 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
          >
            <option value="">My constraints</option>
            {loaderData.staffList
              .filter((m: StaffMemberView) => m.status !== 'removed')
              .map((m: StaffMemberView) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* No staff record banner */}
      {noStaffRecord && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-4 text-sm text-blue-700">
          You don't have a staff roster entry. Ask an admin to add you to Staff before managing availability.
        </div>
      )}

      {/* Constraints table */}
      {!noStaffRecord && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-navy-700">Constraints</h2>
            {!showForm && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-700 text-white text-sm font-medium hover:bg-red-800 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Add Constraint
              </button>
            )}
          </div>

          {/* Add/Edit Form */}
          {showForm && (
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-navy-700 mb-4">
                {editingId ? 'Edit Constraint' : 'New Constraint'}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Type — only for new entries */}
                {!editingId && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ConstraintType }))}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
                    >
                      <option value="time_off">Time Off</option>
                      <option value="unavailable">Unavailable</option>
                      <option value="preferred">Preferred</option>
                      <option value="not_preferred">Not Preferred</option>
                    </select>
                  </div>
                )}

                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                    <input
                      type="datetime-local"
                      value={form.startDatetime}
                      onChange={(e) => setForm((f) => ({ ...f, startDatetime: e.target.value }))}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                    <input
                      type="datetime-local"
                      value={form.endDatetime}
                      onChange={(e) => setForm((f) => ({ ...f, endDatetime: e.target.value }))}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
                  <textarea
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    rows={2}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent resize-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.recurring}
                      onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))}
                      className="rounded border-gray-300 text-red-700 focus:ring-red-700"
                    />
                    Recurring (repeat on selected days within date range)
                  </label>
                  {form.recurring && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {DAY_LABELS.map((label, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleDay(i)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            form.daysOfWeek.includes(i)
                              ? 'bg-navy-700 text-white border-navy-700'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-navy-700'
                          }`}
                          style={{ fontFamily: 'var(--font-condensed)' }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {formError && (
                <p className="mt-3 text-sm text-danger">{formError}</p>
              )}

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => void handleSubmit()}
                  disabled={formBusy}
                  className="px-4 py-2 rounded-md bg-red-700 text-white text-sm font-medium hover:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {formBusy ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={cancelForm}
                  disabled={formBusy}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {staffLoading ? (
            <div className="px-6 py-8 text-sm text-gray-500 text-center">Loading…</div>
          ) : constraints.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-500 text-center">No constraints found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Date Range</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Recurring Days</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Reason</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {constraints.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3"><TypeBadge type={c.type} /></td>
                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{formatDateRange(c.startDatetime, c.endDatetime)}</td>
                    <td className="px-6 py-3 text-gray-500">
                      {c.daysOfWeek
                        ? c.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ')
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{c.reason ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* Only allow editing non-reviewed time_off or other types */}
                        {(c.type !== 'time_off' || c.status === 'pending') && (
                          <button
                            onClick={() => openEdit(c)}
                            className="p-1.5 rounded text-gray-400 hover:text-navy-700 hover:bg-gray-100 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {confirmDelete === c.id ? (
                          <span className="flex items-center gap-1 text-xs text-danger">
                            Delete?{' '}
                            <button
                              onClick={() => void handleDelete(c.id)}
                              disabled={deleteBusy}
                              className="underline font-medium disabled:opacity-50"
                            >
                              Yes
                            </button>
                            {' / '}
                            <button onClick={() => setConfirmDelete(null)} className="underline font-medium">
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(c.id)}
                            className="p-1.5 rounded text-gray-400 hover:text-danger hover:bg-danger-bg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
