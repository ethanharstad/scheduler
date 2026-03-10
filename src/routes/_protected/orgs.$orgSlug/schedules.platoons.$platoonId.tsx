import { useState } from 'react'
import { createFileRoute, redirect, useRouteContext } from '@tanstack/react-router'
import { Edit2, Trash2, UserPlus, X } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { PlatoonDetailView, PlatoonMemberView, StaffOption, PositionOption, RRuleEntry } from '@/lib/platoon.types'
import {
  getPlatoonServerFn,
  updatePlatoonServerFn,
  deletePlatoonServerFn,
  assignMemberServerFn,
  removeMemberFromPlatoonServerFn,
} from '@/server/platoons'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/schedules/platoons/$platoonId')({
  loader: async ({ params }) => {
    const result = await getPlatoonServerFn({
      data: { orgSlug: params.orgSlug, platoonId: params.platoonId },
    })
    if (!result.success) {
      throw redirect({ to: '/orgs/$orgSlug/schedules/platoons', params: { orgSlug: params.orgSlug } })
    }
    return { platoon: result.platoon, allStaff: result.allStaff, positions: result.positions }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.platoon?.name ?? 'Platoon'} | Scene Ready` }],
  }),
  component: PlatoonDetailPage,
})

const PATTERN_SHORTCUTS: ReadonlyArray<{ label: string; rrules: RRuleEntry[] }> = [
  { label: '24/48',           rrules: [{ rrule: 'FREQ=DAILY;INTERVAL=3', startOffset: 0 }] },
  { label: '24/72',           rrules: [{ rrule: 'FREQ=DAILY;INTERVAL=4', startOffset: 0 }] },
  { label: '48/96',           rrules: [{ rrule: 'FREQ=DAILY;INTERVAL=6', startOffset: 0 }] },
  { label: 'Kelly',           rrules: [{ rrule: 'FREQ=DAILY;INTERVAL=9', startOffset: 0 }] },
  {
    label: 'California Swing',
    rrules: [
      { rrule: 'FREQ=DAILY;INTERVAL=9', startOffset: 0 },
      { rrule: 'FREQ=DAILY;INTERVAL=9', startOffset: 2 },
      { rrule: 'FREQ=DAILY;INTERVAL=9', startOffset: 4 },
    ],
  },
  { label: 'Custom', rrules: [] },
]

function RRulesEditor({
  rrules,
  onChange,
}: {
  rrules: RRuleEntry[]
  onChange: (updated: RRuleEntry[]) => void
}) {
  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">
          Recurrence Rules <span className="text-danger">*</span>
        </label>
        <button
          type="button"
          onClick={() => onChange([...rrules, { rrule: '', startOffset: 0 }])}
          className="text-xs text-navy-700 hover:underline font-medium"
        >
          + Add Rule
        </button>
      </div>
      <div className="space-y-2">
        {rrules.map((entry, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              required
              value={entry.rrule}
              onChange={(e) => onChange(rrules.map((r, i) => i === idx ? { ...r, rrule: e.target.value } : r))}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-700"
              placeholder="FREQ=DAILY;INTERVAL=3"
            />
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={0}
                value={entry.startOffset}
                onChange={(e) => onChange(rrules.map((r, i) => i === idx ? { ...r, startOffset: Math.max(0, parseInt(e.target.value, 10) || 0) } : r))}
                className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-navy-700"
                title="Offset in days from the platoon start date"
              />
              <span className="text-xs text-gray-500 w-8">days</span>
            </div>
            {rrules.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rrules.filter((_, i) => i !== idx))}
                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                title="Remove this rule"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Offset = days after start date this rule begins. Most patterns use 0. California Swing uses 0, 2, and 4.
      </p>
    </div>
  )
}

function EditPlatoonForm({
  orgSlug,
  platoon,
  onSuccess,
  onCancel,
}: {
  orgSlug: string
  platoon: PlatoonDetailView
  onSuccess: (updated: Partial<PlatoonDetailView>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(platoon.name)
  const [shiftLabel, setShiftLabel] = useState(platoon.shiftLabel)
  const [rrules, setRrules] = useState<RRuleEntry[]>(platoon.rrules)
  const [startDate, setStartDate] = useState(platoon.startDate)
  const [shiftStartTime, setShiftStartTime] = useState(platoon.shiftStartTime)
  const [shiftEndTime, setShiftEndTime] = useState(platoon.shiftEndTime)
  const [description, setDescription] = useState(platoon.description ?? '')
  const [color, setColor] = useState(platoon.color ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await updatePlatoonServerFn({
        data: {
          orgSlug,
          platoonId: platoon.id,
          name,
          shiftLabel,
          rrules,
          startDate,
          shiftStartTime,
          shiftEndTime,
          description: description || undefined,
          color: color || undefined,
        },
      })
      if (!result.success) {
        if (result.error === 'DUPLICATE_NAME') setError('A platoon with that name already exists.')
        else if (result.error === 'INVALID_RRULE') setError('Invalid rules. Each rule must include FREQ= (e.g. FREQ=DAILY;INTERVAL=3) and offsets must be non-negative integers.')
        else if (result.error === 'FORBIDDEN') setError('You do not have permission to edit platoons.')
        else if (result.error === 'NOT_FOUND') setError('Platoon not found.')
        else setError('An error occurred. Please try again.')
        return
      }
      onSuccess({ name, shiftLabel, rrules, startDate, shiftStartTime, shiftEndTime, description: description || null, color: color || null })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-navy-700">Edit Platoon</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-danger-bg text-danger rounded-lg text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-danger">*</span></label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Shift Label <span className="text-danger">*</span></label>
          <input
            type="text"
            required
            maxLength={50}
            value={shiftLabel}
            onChange={(e) => setShiftLabel(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date <span className="text-danger">*</span></label>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
          />
        </div>
        <div className="sm:col-span-2 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift Start Time <span className="text-danger">*</span></label>
            <input
              type="time"
              required
              value={shiftStartTime}
              onChange={(e) => setShiftStartTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift End Time <span className="text-danger">*</span></label>
            <input
              type="time"
              required
              value={shiftEndTime}
              onChange={(e) => setShiftEndTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
            />
            <p className="mt-1 text-xs text-gray-400">End time ≤ start time means the shift crosses midnight (e.g., a 24-hour shift)</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pattern Shortcut</label>
          <select
            onChange={(e) => {
              const found = PATTERN_SHORTCUTS.find((s) => s.label === e.target.value)
              if (found && found.rrules.length > 0) {
                setRrules(found.rrules.map((r) => ({ ...r })))
              }
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
            defaultValue=""
          >
            <option value="" disabled>Select a pattern…</option>
            {PATTERN_SHORTCUTS.map((s) => (
              <option key={s.label} value={s.label}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
            placeholder="#e63946 or red"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
          />
        </div>
        <RRulesEditor rrules={rrules} onChange={setRrules} />
      </div>

      <div className="flex gap-3 mt-4">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function AssignMemberPanel({
  orgSlug,
  platoonId,
  members,
  allStaff,
  positions,
  onAssigned,
  onCancel,
}: {
  orgSlug: string
  platoonId: string
  members: PlatoonMemberView[]
  allStaff: StaffOption[]
  positions: PositionOption[]
  onAssigned: (staffMemberId: string, name: string, positionId: string | null, positionName: string | null) => void
  onCancel: () => void
}) {
  const assignedIds = new Set(members.map((m) => m.staffMemberId))
  const available = allStaff.filter((s) => !assignedIds.has(s.id))

  const [selectedId, setSelectedId] = useState('')
  const [selectedPositionId, setSelectedPositionId] = useState('')
  const [pendingMove, setPendingMove] = useState<{ movedFrom: string; staffMemberId: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function doAssign(staffMemberId: string, name: string) {
    setError(null)
    setSubmitting(true)
    const positionId = selectedPositionId || undefined
    const positionName = positionId ? (positions.find((p) => p.id === positionId)?.name ?? null) : null
    try {
      const result = await assignMemberServerFn({
        data: { orgSlug, platoonId, staffMemberId, positionId },
      })
      if (!result.success) {
        if (result.error === 'MEMBER_NOT_FOUND') setError('Staff member not found.')
        else if (result.error === 'PLATOON_NOT_FOUND') setError('Platoon not found.')
        else if (result.error === 'FORBIDDEN') setError('You do not have permission to assign members.')
        else setError('An error occurred. Please try again.')
        return
      }
      onAssigned(staffMemberId, name, positionId ?? null, positionName)
      setSelectedId('')
      setSelectedPositionId('')
      setPendingMove(null)
    } finally {
      setSubmitting(false)
    }
  }

  function handleAssignClick() {
    if (!selectedId) return
    const staff = allStaff.find((s) => s.id === selectedId)
    if (!staff) return

    if (staff.currentPlatoonName) {
      setPendingMove({ movedFrom: staff.currentPlatoonName, staffMemberId: selectedId, name: staff.name })
    } else {
      void doAssign(selectedId, staff.name)
    }
  }

  if (available.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Assign Member</span>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-500">All active staff members are already assigned to this platoon.</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">Assign Member</span>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-danger-bg text-danger rounded text-sm">{error}</div>
      )}

      {pendingMove && (
        <div className="mb-3 px-3 py-2 bg-warning-bg text-warning rounded text-sm">
          <p className="font-medium">This member is currently on {pendingMove.movedFrom}.</p>
          <p className="mt-1">Move them to this platoon?</p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => void doAssign(pendingMove.staffMemberId, pendingMove.name)}
              disabled={submitting}
              className="px-3 py-1 bg-red-700 text-white text-xs font-medium rounded hover:bg-red-800 disabled:opacity-50"
            >
              Confirm Move
            </button>
            <button
              type="button"
              onClick={() => { setPendingMove(null); setSelectedId('') }}
              className="px-3 py-1 border border-gray-300 text-gray-700 text-xs font-medium rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!pendingMove && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
            >
              <option value="" disabled>Select a staff member…</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {positions.length > 0 && (
              <select
                value={selectedPositionId}
                onChange={(e) => setSelectedPositionId(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
              >
                <option value="">No position</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => handleAssignClick()}
              disabled={!selectedId || submitting}
              className="px-4 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              Assign
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlatoonDetailPage() {
  const { orgSlug, platoonId } = Route.useParams()
  const { userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { platoon: initialPlatoon, allStaff, positions } = Route.useLoaderData()
  const navigate = Route.useNavigate()

  const [platoon, setPlatoon] = useState<PlatoonDetailView>(initialPlatoon)
  const [members, setMembers] = useState<PlatoonMemberView[]>(initialPlatoon.members)
  const [showEdit, setShowEdit] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canEdit = canDo(userRole, 'create-edit-schedules')

  function handleEditSuccess(updated: Partial<PlatoonDetailView>) {
    setPlatoon((prev) => ({ ...prev, ...updated }))
    setShowEdit(false)
  }

  function handleAssigned(staffMemberId: string, name: string, positionId: string | null, positionName: string | null) {
    setMembers((prev) => {
      const filtered = prev.filter((m) => m.staffMemberId !== staffMemberId)
      return [...filtered, { staffMemberId, name, positionId, positionName }].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      )
    })
    setShowAssign(false)
  }

  async function handleRemoveMember(staffMemberId: string) {
    const result = await removeMemberFromPlatoonServerFn({
      data: { orgSlug, platoonId, staffMemberId },
    })
    if (result.success) {
      setMembers((prev) => prev.filter((m) => m.staffMemberId !== staffMemberId))
    }
  }

  async function handleDelete() {
    setDeleteError(null)
    setDeleting(true)
    try {
      const result = await deletePlatoonServerFn({ data: { orgSlug, platoonId } })
      if (!result.success) {
        if (result.error === 'NOT_FOUND') setDeleteError('Platoon not found.')
        else if (result.error === 'FORBIDDEN') setDeleteError('You do not have permission to delete platoons.')
        else setDeleteError('An error occurred. Please try again.')
        return
      }
      await navigate({ to: '/orgs/$orgSlug/schedules/platoons', params: { orgSlug } })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-3xl">
      {showEdit ? (
        <EditPlatoonForm
          orgSlug={orgSlug}
          platoon={{ ...platoon, members }}
          onSuccess={handleEditSuccess}
          onCancel={() => setShowEdit(false)}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                {platoon.color && (
                  <span
                    className="w-4 h-4 rounded-full border border-gray-200 shrink-0"
                    style={{ backgroundColor: platoon.color }}
                  />
                )}
                <h1 className="text-2xl font-bold text-navy-700">{platoon.name}</h1>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-2">
                <span><span className="font-medium text-gray-700">Shift Label:</span> {platoon.shiftLabel}</span>
                <span><span className="font-medium text-gray-700">Start Date:</span> {platoon.startDate}</span>
                <span><span className="font-medium text-gray-700">Shift Times:</span> {platoon.shiftStartTime} → {platoon.shiftEndTime}</span>
              </div>
              <div className="mt-2">
                <span className="text-sm font-medium text-gray-700">Pattern:</span>
                {platoon.rrules.length === 1 ? (
                  <code className="ml-1 text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                    {platoon.rrules[0].rrule}
                  </code>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {platoon.rrules.map((entry, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{entry.rrule}</code>
                        {entry.startOffset > 0 && (
                          <span className="text-xs text-gray-500">+{entry.startOffset} day{entry.startOffset !== 1 ? 's' : ''}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {platoon.description && (
                <p className="text-sm text-gray-600 mt-3">{platoon.description}</p>
              )}
            </div>
            {canEdit && (
              <div className="flex gap-2 ml-4 shrink-0">
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>

          {showDeleteConfirm && (
            <div className="mt-4 px-4 py-3 bg-danger-bg border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-danger">
                Delete {platoon.name}? All member assignments will be cleared.
              </p>
              {deleteError && <p className="text-sm text-danger mt-1">{deleteError}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="px-3 py-1.5 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Members section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-navy-700">
            Members <span className="text-gray-400 font-normal text-base">({members.length})</span>
          </h2>
          {canEdit && !showAssign && (
            <button
              onClick={() => setShowAssign(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Assign Member
            </button>
          )}
        </div>

        {showAssign && (
          <AssignMemberPanel
            orgSlug={orgSlug}
            platoonId={platoonId}
            members={members}
            allStaff={allStaff}
            positions={positions}
            onAssigned={handleAssigned}
            onCancel={() => setShowAssign(false)}
          />
        )}

        {members.length === 0 ? (
          <p className="text-sm text-gray-500">No members assigned to this platoon yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {members.map((m) => (
              <li key={m.staffMemberId} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-gray-800">{m.name}</span>
                  {m.positionName && (
                    <span
                      className="rounded-full text-xs font-semibold uppercase tracking-wide px-2 py-0.5 bg-gray-100 text-gray-600 shrink-0"
                      style={{ fontFamily: 'var(--font-condensed)' }}
                    >
                      {m.positionName}
                    </span>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => void handleRemoveMember(m.staffMemberId)}
                    className="text-gray-400 hover:text-red-600 transition-colors p-1 shrink-0"
                    title="Remove from platoon"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
