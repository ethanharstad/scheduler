import { createFileRoute, useRouter, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { canDo } from '@/lib/rbac'
import { listScheduleRequirementsServerFn, createScheduleRequirementServerFn, updateScheduleRequirementServerFn, deleteScheduleRequirementServerFn } from '@/server/schedule-requirements'
import { listPositionsServerFn } from '@/server/qualifications'
import type { ScheduleRequirementView } from '@/lib/schedule-requirement.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/schedules/requirements')({
  head: () => ({
    meta: [{ title: 'Schedule Requirements | Scene Ready' }],
  }),
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Sun=0 … Sat=6 (matches JS Date.getDay())
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const END_DAY_OPTIONS = [
  { label: 'Same day', value: 0 },
  { label: 'Next day (+1)', value: 1 },
  { label: '+2 days', value: 2 },
  { label: '+3 days', value: 3 },
  { label: '+4 days', value: 4 },
  { label: '+5 days', value: 5 },
  { label: '+6 days', value: 6 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RecurrenceMode = 'weekly' | 'daily' | 'custom'

function buildRrule(mode: RecurrenceMode, selectedDays: number[], customRrule: string): string {
  if (mode === 'daily') return 'FREQ=DAILY'
  if (mode === 'custom') return customRrule.trim()
  const sorted = [...selectedDays].sort((a, b) => a - b)
  return `FREQ=WEEKLY;BYDAY=${sorted.map((d) => DAY_CODES[d]).join(',')}`
}

function parseRrule(rrule: string): { mode: RecurrenceMode; days: number[] } {
  if (rrule === 'FREQ=DAILY') return { mode: 'daily', days: [] }
  const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/i)
  if (rrule.startsWith('FREQ=WEEKLY') && bydayMatch) {
    const days = bydayMatch[1]
      .split(',')
      .map((d) => DAY_CODES.indexOf(d.toUpperCase() as (typeof DAY_CODES)[number]))
      .filter((d) => d >= 0)
    return { mode: 'weekly', days }
  }
  return { mode: 'custom', days: [] }
}

function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function describeRrule(rrule: string): string {
  if (rrule === 'FREQ=DAILY') return 'Every day'
  if (rrule === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'Weekdays'
  if (rrule === 'FREQ=WEEKLY;BYDAY=SA,SU') return 'Weekends'
  const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/i)
  if (bydayMatch && rrule.startsWith('FREQ=WEEKLY')) {
    const days = bydayMatch[1]
      .split(',')
      .map((d) => {
        const idx = DAY_CODES.indexOf(d.toUpperCase() as (typeof DAY_CODES)[number])
        return idx >= 0 ? DAY_LABELS[idx] : d
      })
    return days.join(', ')
  }
  return rrule.length > 32 ? rrule.slice(0, 32) + '…' : rrule
}

function describeWindow(req: ScheduleRequirementView): string | null {
  if (!req.windowStartTime || !req.windowEndTime || req.windowEndDayOffset == null) return null
  const start = formatTime(req.windowStartTime)
  const end = formatTime(req.windowEndTime)
  const offset = req.windowEndDayOffset
  if (offset === 0) return `${start} – ${end}`
  // Try to compute end day name from a single BYDAY
  const bydayMatch = req.rrule.match(/BYDAY=([A-Z,]+)/i)
  if (bydayMatch) {
    const parts = bydayMatch[1].split(',')
    if (parts.length === 1) {
      const startDayIdx = DAY_CODES.indexOf(parts[0].toUpperCase() as (typeof DAY_CODES)[number])
      if (startDayIdx >= 0) {
        const endDayIdx = (startDayIdx + offset) % 7
        return `${start} → ${DAY_LABELS[endDayIdx]} ${end}`
      }
    }
  }
  return `${start} → +${offset}d ${end}`
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

type FormState = {
  name: string
  positionId: string
  recurrenceMode: RecurrenceMode
  selectedDays: number[]
  customRrule: string
  effectiveStart: string
  effectiveEnd: string
  minStaff: string
  maxStaff: string
  hasTimeWindow: boolean
  windowStartTime: string
  windowEndTime: string
  windowEndDayOffset: string
  sortOrder: string
}

function emptyForm(): FormState {
  return {
    name: '',
    positionId: '',
    recurrenceMode: 'weekly',
    selectedDays: [],
    customRrule: '',
    effectiveStart: '',
    effectiveEnd: '',
    minStaff: '1',
    maxStaff: '',
    hasTimeWindow: false,
    windowStartTime: '',
    windowEndTime: '',
    windowEndDayOffset: '0',
    sortOrder: '0',
  }
}

function formFromRequirement(r: ScheduleRequirementView): FormState {
  const { mode, days } = parseRrule(r.rrule)
  const hasWindow = !!(r.windowStartTime && r.windowEndTime && r.windowEndDayOffset != null)
  return {
    name: r.name,
    positionId: r.positionId ?? '',
    recurrenceMode: mode,
    selectedDays: days,
    customRrule: mode === 'custom' ? r.rrule : '',
    effectiveStart: r.effectiveStart,
    effectiveEnd: r.effectiveEnd ?? '',
    minStaff: String(r.minStaff),
    maxStaff: r.maxStaff != null ? String(r.maxStaff) : '',
    hasTimeWindow: hasWindow,
    windowStartTime: r.windowStartTime ?? '',
    windowEndTime: r.windowEndTime ?? '',
    windowEndDayOffset: r.windowEndDayOffset != null ? String(r.windowEndDayOffset) : '0',
    sortOrder: String(r.sortOrder),
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

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

  function toggleDay(dayIdx: number) {
    setForm((f) => ({
      ...f,
      selectedDays: f.selectedDays.includes(dayIdx)
        ? f.selectedDays.filter((d) => d !== dayIdx)
        : [...f.selectedDays, dayIdx],
    }))
  }

  function setRecurrenceMode(mode: RecurrenceMode) {
    setForm((f) => ({
      ...f,
      recurrenceMode: mode,
      selectedDays: mode === 'weekly' ? f.selectedDays : [],
    }))
  }

  function setPreset(days: number[]) {
    setForm((f) => ({ ...f, recurrenceMode: 'weekly', selectedDays: days }))
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const rrule = buildRrule(form.recurrenceMode, form.selectedDays, form.customRrule)
    if (!rrule) { setError('Please select at least one day or enter an RRULE.'); setSaving(false); return }
    if (form.recurrenceMode === 'weekly' && form.selectedDays.length === 0) {
      setError('Select at least one day of the week.')
      setSaving(false)
      return
    }

    const minStaff = parseInt(form.minStaff, 10)
    const maxStaff = form.maxStaff.trim() !== '' ? parseInt(form.maxStaff, 10) : null
    const windowStartTime = form.hasTimeWindow && form.windowStartTime ? form.windowStartTime : null
    const windowEndTime = form.hasTimeWindow && form.windowEndTime ? form.windowEndTime : null
    const windowEndDayOffset = form.hasTimeWindow ? parseInt(form.windowEndDayOffset, 10) : null

    const payload = {
      orgSlug,
      name: form.name,
      positionId: form.positionId || null,
      minStaff,
      maxStaff,
      effectiveStart: form.effectiveStart,
      effectiveEnd: form.effectiveEnd || null,
      rrule,
      windowStartTime,
      windowEndTime,
      windowEndDayOffset,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
    }

    try {
      if (editingId) {
        const result = await updateScheduleRequirementServerFn({ data: { ...payload, requirementId: editingId } })
        if (!result.success) { setError(result.error === 'VALIDATION_ERROR' ? 'Please check your inputs.' : result.error); return }
      } else {
        const result = await createScheduleRequirementServerFn({ data: payload })
        if (!result.success) { setError(result.error === 'VALIDATION_ERROR' ? 'Please check your inputs.' : result.error); return }
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

  const labelCls = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1'
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Define minimum staffing needs for recurring windows.</p>
        {canEdit && !showForm && (
          <button onClick={openCreate} className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg transition-colors">
            + Add Requirement
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-base font-semibold text-navy-700">{editingId ? 'Edit Requirement' : 'New Requirement'}</h2>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">

            {/* Name */}
            <div>
              <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                Name <span className="text-red-600">*</span>
              </label>
              <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)}
                maxLength={100} required placeholder="e.g. Weekend Engine Coverage" className={inputCls} />
            </div>

            {/* Position */}
            <div>
              <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>Position</label>
              <select value={form.positionId} onChange={(e) => setField('positionId', e.target.value)}
                className={inputCls + ' bg-white'}>
                <option value="">— No position —</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Recurrence */}
            <div>
              <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                Recurrence <span className="text-red-600">*</span>
              </label>

              {/* Mode tabs */}
              <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1 w-fit">
                {(['weekly', 'daily', 'custom'] as RecurrenceMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => setRecurrenceMode(mode)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors capitalize ${
                      form.recurrenceMode === mode ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    style={{ fontFamily: 'var(--font-condensed)' }}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {form.recurrenceMode === 'weekly' && (
                <div className="space-y-2">
                  {/* Preset buttons */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      { label: 'Every day', days: [0,1,2,3,4,5,6] },
                      { label: 'Weekdays', days: [1,2,3,4,5] },
                      { label: 'Weekends', days: [0,6] },
                    ].map((preset) => (
                      <button key={preset.label} type="button" onClick={() => setPreset(preset.days)}
                        className="px-2.5 py-1 rounded text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:border-navy-700 hover:text-navy-700 transition-colors"
                        style={{ fontFamily: 'var(--font-condensed)' }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {/* Day toggles */}
                  <div className="flex gap-1.5">
                    {DAY_LABELS.map((label, idx) => (
                      <button key={idx} type="button" onClick={() => toggleDay(idx)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          form.selectedDays.includes(idx)
                            ? 'bg-navy-700 text-white border-navy-700'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-navy-700'
                        }`}
                        style={{ fontFamily: 'var(--font-condensed)' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.recurrenceMode === 'daily' && (
                <p className="text-sm text-gray-500">Requirement applies every day within the effective date range.</p>
              )}

              {form.recurrenceMode === 'custom' && (
                <input type="text" value={form.customRrule} onChange={(e) => setField('customRrule', e.target.value)}
                  required placeholder="e.g. FREQ=WEEKLY;BYDAY=MO,WE"
                  className={inputCls + ' font-mono'} />
              )}
            </div>

            {/* Time window */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <input type="checkbox" id="hasTimeWindow" checked={form.hasTimeWindow}
                  onChange={(e) => setField('hasTimeWindow', e.target.checked)}
                  className="rounded border-gray-300 text-navy-700 focus:ring-navy-700/30" />
                <label htmlFor="hasTimeWindow" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                  Specify time window
                </label>
              </div>

              {form.hasTimeWindow && (
                <div className="flex flex-wrap items-end gap-3 pl-1">
                  <div>
                    <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                      Start time <span className="text-red-600">*</span>
                    </label>
                    <input type="time" value={form.windowStartTime} required
                      onChange={(e) => setField('windowStartTime', e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700" />
                  </div>
                  <div>
                    <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                      Ends on <span className="text-red-600">*</span>
                    </label>
                    <select value={form.windowEndDayOffset} onChange={(e) => setField('windowEndDayOffset', e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700 bg-white">
                      {END_DAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                      End time <span className="text-red-600">*</span>
                    </label>
                    <input type="time" value={form.windowEndTime} required
                      onChange={(e) => setField('windowEndTime', e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700" />
                  </div>
                  {/* Preview */}
                  {form.windowStartTime && form.windowEndTime && (
                    <p className="text-xs text-gray-500 pb-2">
                      e.g. {formatTime(form.windowStartTime)}
                      {parseInt(form.windowEndDayOffset, 10) > 0
                        ? ` → +${form.windowEndDayOffset}d `
                        : ' – '}
                      {formatTime(form.windowEndTime)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Effective dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                  Effective Start <span className="text-red-600">*</span>
                </label>
                <input type="date" value={form.effectiveStart} onChange={(e) => setField('effectiveStart', e.target.value)}
                  required className={inputCls} />
              </div>
              <div>
                <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                  Effective End <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input type="date" value={form.effectiveEnd} onChange={(e) => setField('effectiveEnd', e.target.value)}
                  className={inputCls} />
              </div>
            </div>

            {/* Min / Max staff / Sort Order */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                  Min Staff <span className="text-red-600">*</span>
                </label>
                <input type="number" min={0} value={form.minStaff}
                  onChange={(e) => setField('minStaff', e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                  Max Staff <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input type="number" min={0} value={form.maxStaff}
                  onChange={(e) => setField('maxStaff', e.target.value)} placeholder="No cap" className={inputCls} />
              </div>
              <div>
                <label className={labelCls} style={{ fontFamily: 'var(--font-condensed)' }}>
                  Sort Order
                </label>
                <input type="number" value={form.sortOrder}
                  onChange={(e) => setField('sortOrder', e.target.value)} placeholder="0" className={inputCls} />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Requirement'}
              </button>
              <button type="button" onClick={closeForm}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
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
            <button onClick={openCreate}
              className="mt-3 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg transition-colors">
              + Add Requirement
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Position', 'Recurrence', 'Time Window', 'Effective Dates', 'Min / Max', 'Order', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide"
                    style={{ fontFamily: 'var(--font-condensed)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requirements.map((req) => {
                const window = describeWindow(req)
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-navy-700">{req.name}</td>
                    <td className="px-4 py-3 text-gray-600">{req.positionName ?? <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-navy-700/10 text-navy-700"
                        style={{ fontFamily: 'var(--font-condensed)' }}>
                        {describeRrule(req.rrule)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {window ?? <span className="text-gray-400">All day</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {req.effectiveStart} → {req.effectiveEnd ?? <span className="text-gray-400">ongoing</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {req.minStaff}{req.maxStaff != null ? ` / ${req.maxStaff}` : ' / —'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-center">{req.sortOrder}</td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <div className="flex items-center gap-3 justify-end">
                          {deleteConfirmId === req.id ? (
                            <>
                              <span className="text-xs text-gray-500">Delete?</span>
                              <button onClick={() => void handleDelete(req.id)} disabled={deleting}
                                className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-60">
                                {deleting ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)}
                                className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => openEdit(req)} className="text-xs font-medium text-navy-700 hover:underline">Edit</button>
                              <button onClick={() => setDeleteConfirmId(req.id)} className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
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
