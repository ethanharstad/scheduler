import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { PlatoonView, RRuleEntry } from '@/lib/platoon.types'
import { listPlatoonsServerFn, createPlatoonServerFn } from '@/server/platoons'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/platoons/')({
  head: () => ({
    meta: [{ title: 'Platoons | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const result = await listPlatoonsServerFn({ data: { orgSlug: params.orgSlug } })
    return {
      platoons: result.success ? result.platoons : [],
      scheduleDayStart: result.success ? result.scheduleDayStart : '00:00',
    }
  },
  component: PlatoonsPage,
})

const PATTERN_SHORTCUTS: ReadonlyArray<{ label: string; rrules: RRuleEntry[] }> = [
  { label: '24/48',           rrules: [{ rrule: 'FREQ=DAILY;INTERVAL=3', startOffset: 0 }] },
  { label: '24/72',           rrules: [{ rrule: 'FREQ=DAILY;INTERVAL=4', startOffset: 0 }] },
  { label: '48/96',           rrules: [{ rrule: 'FREQ=DAILY;INTERVAL=6', startOffset: 0 }] },
  { label: 'Kelly',           rrules: [{ rrule: 'FREQ=DAILY;INTERVAL=9', startOffset: 0 }] },
  {
    label: 'California Swing',
    rrules: [
      { rrule: 'FREQ=DAILY;INTERVAL=9', startOffset: 0 },  // Day 1, 10, 19 ...
      { rrule: 'FREQ=DAILY;INTERVAL=9', startOffset: 2 },  // Day 3, 12, 21 ...
      { rrule: 'FREQ=DAILY;INTERVAL=9', startOffset: 4 },  // Day 5, 14, 23 ...
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

function CreatePlatoonForm({
  orgSlug,
  defaultShiftStartTime,
  onSuccess,
  onCancel,
}: {
  orgSlug: string
  defaultShiftStartTime: string
  onSuccess: (platoon: PlatoonView) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [shiftLabel, setShiftLabel] = useState('')
  const [rrules, setRrules] = useState<RRuleEntry[]>([{ rrule: '', startOffset: 0 }])
  const [startDate, setStartDate] = useState('')
  const [shiftStartTime, setShiftStartTime] = useState(defaultShiftStartTime)
  const [shiftEndTime, setShiftEndTime] = useState('08:00')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await createPlatoonServerFn({
        data: {
          orgSlug,
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
        else if (result.error === 'FORBIDDEN') setError('You do not have permission to create platoons.')
        else setError('An error occurred. Please try again.')
        return
      }
      onSuccess({
        id: result.platoonId,
        name,
        shiftLabel,
        rrules,
        startDate,
        shiftStartTime,
        shiftEndTime,
        description: description || null,
        color: color || null,
        memberCount: 0,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-navy-700">New Platoon</h2>
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
            placeholder="A Platoon"
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
            placeholder="A Shift"
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
            placeholder="Optional description"
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
          {submitting ? 'Creating…' : 'Create Platoon'}
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

function PlatoonsPage() {
  const { orgSlug } = Route.useParams()
  const { userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { platoons: initialPlatoons, scheduleDayStart } = Route.useLoaderData()

  const [platoons, setPlatoons] = useState<PlatoonView[]>(initialPlatoons)
  const [showCreate, setShowCreate] = useState(false)

  const canEdit = canDo(userRole, 'create-edit-schedules')

  function handleCreated(platoon: PlatoonView) {
    setPlatoons((prev) => [...prev, platoon].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
    setShowCreate(false)
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Platoons</h1>
          <p className="text-sm text-gray-500 mt-1">Shift groups and their patrol patterns</p>
        </div>
        {canEdit && !showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Platoon
          </button>
        )}
      </div>

      {showCreate && (
        <CreatePlatoonForm
          orgSlug={orgSlug}
          defaultShiftStartTime={scheduleDayStart}
          onSuccess={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {platoons.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500 text-sm">No platoons yet.</p>
          {canEdit && (
            <p className="text-gray-400 text-sm mt-1">Click "New Platoon" to create the first one.</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Shift Label</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Start Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Members</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Color</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {platoons.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-navy-700">
                    <Link
                      to="/orgs/$orgSlug/platoons/$platoonId"
                      params={{ orgSlug, platoonId: p.id }}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.shiftLabel}</td>
                  <td className="px-4 py-3 text-gray-600">{p.startDate}</td>
                  <td className="px-4 py-3 text-gray-600">{p.memberCount}</td>
                  <td className="px-4 py-3">
                    {p.color ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full border border-gray-200 shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-gray-500 text-xs">{p.color}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
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
