import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { canDo } from '@/lib/rbac'
import { useRouteContext } from '@tanstack/react-router'
import { listScheduleRequirementsServerFn, createScheduleRequirementServerFn, updateScheduleRequirementServerFn, deleteScheduleRequirementServerFn } from '@/server/schedule-requirements'
import { listPositionsServerFn } from '@/server/qualifications'
import type { ScheduleRequirementView } from '@/lib/schedule-requirement.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/schedules/requirements')({
  loader: async ({ params }) => {
    const [reqResult, posResult] = await Promise.all([
      listScheduleRequirementsServerFn({ data: { orgSlug: params.orgSlug } }),
      listPositionsServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      requirements: reqResult.success ? reqResult.requirements : [],
      positions: posResult.success ? posResult.positions : [],
    }
  },
  component: ScheduleRequirementsPage,
})

const RRULE_SHORTCUTS = [
  { label: 'Every day', value: 'FREQ=DAILY' },
  { label: 'Weekdays', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Weekends', value: 'FREQ=WEEKLY;BYDAY=SA,SU' },
  { label: 'MWF', value: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' },
] as const

function matchShortcut(rrule: string): string | null {
  for (const s of RRULE_SHORTCUTS) {
    if (s.value === rrule) return s.value
  }
  return null
}

function rruleLabel(rrule: string): string {
  for (const s of RRULE_SHORTCUTS) {
    if (s.value === rrule) return s.label
  }
  return rrule.length > 30 ? rrule.slice(0, 30) + '…' : rrule
}

type FormState = {
  name: string
  positionId: string
  rrule: string
  customRrule: string
  isCustom: boolean
  effectiveStart: string
  effectiveEnd: string
  minStaff: string
  maxStaff: string
}

function emptyForm(): FormState {
  return {
    name: '',
    positionId: '',
    rrule: RRULE_SHORTCUTS[0].value,
    customRrule: '',
    isCustom: false,
    effectiveStart: '',
    effectiveEnd: '',
    minStaff: '1',
    maxStaff: '',
  }
}

function formFromRequirement(r: ScheduleRequirementView): FormState {
  const shortcut = matchShortcut(r.rrule)
  return {
    name: r.name,
    positionId: r.positionId ?? '',
    rrule: shortcut ?? r.rrule,
    customRrule: shortcut ? '' : r.rrule,
    isCustom: !shortcut,
    effectiveStart: r.effectiveStart,
    effectiveEnd: r.effectiveEnd ?? '',
    minStaff: String(r.minStaff),
    maxStaff: r.maxStaff != null ? String(r.maxStaff) : '',
  }
}

function ScheduleRequirementsPage() {
  const { requirements, positions } = Route.useLoaderData()
  const { orgSlug } = Route.useParams()
  const { userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const router = useRouter()

  const canEdit = canDo(userRole, 'create-edit-schedules')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
    setShowForm(true)
  }

  function openEdit(req: ScheduleRequirementView) {
    setEditingId(req.id)
    setForm(formFromRequirement(req))
    setError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setError(null)
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function selectShortcut(value: string) {
    setForm((f) => ({ ...f, rrule: value, isCustom: false, customRrule: '' }))
  }

  function selectCustom() {
    setForm((f) => ({ ...f, isCustom: true, rrule: '' }))
  }

  function effectiveRrule(): string {
    return form.isCustom ? form.customRrule.trim() : form.rrule
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const minStaff = parseInt(form.minStaff, 10)
    const maxStaff = form.maxStaff.trim() !== '' ? parseInt(form.maxStaff, 10) : null

    try {
      if (editingId) {
        const result = await updateScheduleRequirementServerFn({
          data: {
            orgSlug,
            requirementId: editingId,
            name: form.name,
            positionId: form.positionId || null,
            minStaff,
            maxStaff,
            effectiveStart: form.effectiveStart,
            effectiveEnd: form.effectiveEnd || null,
            rrule: effectiveRrule(),
          },
        })
        if (!result.success) {
          setError(result.error === 'VALIDATION_ERROR' ? 'Please check your inputs.' : result.error)
          return
        }
      } else {
        const result = await createScheduleRequirementServerFn({
          data: {
            orgSlug,
            name: form.name,
            positionId: form.positionId || null,
            minStaff,
            maxStaff,
            effectiveStart: form.effectiveStart,
            effectiveEnd: form.effectiveEnd || null,
            rrule: effectiveRrule(),
          },
        })
        if (!result.success) {
          setError(result.error === 'VALIDATION_ERROR' ? 'Please check your inputs.' : result.error)
          return
        }
      }
      closeForm()
      await router.invalidate()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      await deleteScheduleRequirementServerFn({ data: { orgSlug, requirementId: id } })
      setDeleteConfirmId(null)
      await router.invalidate()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-sans)' }}>
            Schedule Requirements
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Define minimum staffing needs for recurring days.</p>
        </div>
        {canEdit && !showForm && (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            + Add Requirement
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-base font-semibold text-navy-700">
            {editingId ? 'Edit Requirement' : 'New Requirement'}
          </h2>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                maxLength={100}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700"
                placeholder="e.g. Engine 1 Weekday Coverage"
              />
            </div>

            {/* Position */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                Position
              </label>
              <select
                value={form.positionId}
                onChange={(e) => setField('positionId', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700 bg-white"
              >
                <option value="">— No position —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Recurrence */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                Recurrence <span className="text-red-600">*</span>
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {RRULE_SHORTCUTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => selectShortcut(s.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      !form.isCustom && form.rrule === s.value
                        ? 'bg-navy-700 text-white border-navy-700'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-navy-700'
                    }`}
                    style={{ fontFamily: 'var(--font-condensed)' }}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={selectCustom}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    form.isCustom
                      ? 'bg-navy-700 text-white border-navy-700'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-navy-700'
                  }`}
                  style={{ fontFamily: 'var(--font-condensed)' }}
                >
                  Custom
                </button>
              </div>
              {form.isCustom && (
                <input
                  type="text"
                  value={form.customRrule}
                  onChange={(e) => setField('customRrule', e.target.value)}
                  required
                  placeholder="e.g. FREQ=WEEKLY;BYDAY=MO,WE"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700"
                />
              )}
            </div>

            {/* Effective dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Effective Start <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={form.effectiveStart}
                  onChange={(e) => setField('effectiveStart', e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Effective End <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.effectiveEnd}
                  onChange={(e) => setField('effectiveEnd', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700"
                  placeholder="No end date"
                />
              </div>
            </div>

            {/* Min / Max staff */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Min Staff <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.minStaff}
                  onChange={(e) => setField('minStaff', e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Max Staff <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.maxStaff}
                  onChange={(e) => setField('maxStaff', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700"
                  placeholder="No cap"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Requirement'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {requirements.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500 text-sm">No schedule requirements yet.</p>
          {canEdit && !showForm && (
            <button
              onClick={openCreate}
              className="mt-3 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              + Add Requirement
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Position', 'Recurrence', 'Effective Dates', 'Min / Max', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide"
                    style={{ fontFamily: 'var(--font-condensed)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requirements.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-navy-700">{req.name}</td>
                  <td className="px-4 py-3 text-gray-600">{req.positionName ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3">
                    {matchShortcut(req.rrule) ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-navy-700/10 text-navy-700"
                        style={{ fontFamily: 'var(--font-condensed)' }}
                      >
                        {rruleLabel(req.rrule)}
                      </span>
                    ) : (
                      <code className="text-xs text-gray-500 font-mono">{rruleLabel(req.rrule)}</code>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {req.effectiveStart} → {req.effectiveEnd ?? <span className="text-gray-400">ongoing</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {req.minStaff}{req.maxStaff != null ? ` / ${req.maxStaff}` : ' / —'}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex items-center gap-3 justify-end">
                        {deleteConfirmId === req.id ? (
                          <>
                            <span className="text-xs text-gray-500">Delete?</span>
                            <button
                              onClick={() => void handleDelete(req.id)}
                              disabled={deleting}
                              className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-60"
                            >
                              {deleting ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => openEdit(req)}
                              className="text-xs font-medium text-navy-700 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(req.id)}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
