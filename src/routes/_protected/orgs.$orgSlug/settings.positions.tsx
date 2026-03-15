import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { Plus, Pencil, Trash2, ChevronDown, X } from 'lucide-react'
import type { RankView, CertTypeView, PositionView } from '@/lib/qualifications.types'
import {
  listRanksServerFn,
  listCertTypesServerFn,
  listPositionsServerFn,
  createPositionServerFn,
  updatePositionServerFn,
  deletePositionServerFn,
} from '@/server/qualifications'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/settings/positions')({
  head: () => ({
    meta: [{ title: 'Positions | Settings | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const [ranksResult, certTypesResult, positionsResult] = await Promise.all([
      listRanksServerFn({ data: { orgSlug: params.orgSlug } }),
      listCertTypesServerFn({ data: { orgSlug: params.orgSlug } }),
      listPositionsServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      ranks: ranksResult.success ? ranksResult.ranks : [],
      certTypes: certTypesResult.success ? certTypesResult.certTypes : [],
      positions: positionsResult.success ? positionsResult.positions : [],
    }
  },
  component: PositionsPage,
})

function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-navy-700 text-white text-sm font-bold shrink-0"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {priority}
    </span>
  )
}

function CertChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 text-xs font-semibold border border-navy-100"
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {label}
    </span>
  )
}

function RequirementEditor({
  reqs,
  setReqs,
  certTypes,
}: {
  reqs: Array<{ certTypeId: string; minCertLevelId: string }>
  setReqs: React.Dispatch<React.SetStateAction<Array<{ certTypeId: string; minCertLevelId: string }>>>
  certTypes: CertTypeView[]
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Cert Requirements</p>
      {reqs.map((req, i) => {
        const ct = certTypes.find((c) => c.id === req.certTypeId)
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={req.certTypeId}
                onChange={(e) => setReqs((prev) => prev.map((r, ii) => ii === i ? { ...r, certTypeId: e.target.value, minCertLevelId: '' } : r))}
                className="w-full appearance-none px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
              >
                <option value="">Select cert type…</option>
                {certTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown className="absolute right-1.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            {ct?.isLeveled && ct.levels.length > 0 && (
              <div className="relative flex-1">
                <select
                  value={req.minCertLevelId}
                  onChange={(e) => setReqs((prev) => prev.map((r, ii) => ii === i ? { ...r, minCertLevelId: e.target.value } : r))}
                  className="w-full appearance-none px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
                >
                  <option value="">Any level</option>
                  {ct.levels.map((l) => <option key={l.id} value={l.id}>Min: {l.name}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            )}
            <button type="button" onClick={() => setReqs((prev) => prev.filter((_, ii) => ii !== i))} className="text-gray-400 hover:text-danger">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => setReqs((prev) => [...prev, { certTypeId: '', minCertLevelId: '' }])}
        className="text-xs text-navy-600 hover:text-navy-800 font-medium"
      >
        + Add cert requirement
      </button>
    </div>
  )
}

function PositionForm({
  name, setName, description, setDescription, minRankId, setMinRankId,
  sortOrder, setSortOrder, reqs, setReqs, onSubmit, busy, error, onCancel, submitLabel,
  ranks, certTypes,
}: {
  name: string; setName: (v: string) => void
  description: string; setDescription: (v: string) => void
  minRankId: string; setMinRankId: (v: string) => void
  sortOrder: number; setSortOrder: (v: number) => void
  reqs: Array<{ certTypeId: string; minCertLevelId: string }>
  setReqs: React.Dispatch<React.SetStateAction<Array<{ certTypeId: string; minCertLevelId: string }>>>
  onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void
  busy: boolean; error: string | null; onCancel: () => void; submitLabel: string
  ranks: RankView[]; certTypes: CertTypeView[]
}) {
  return (
    <form onSubmit={onSubmit} className="p-5 rounded-lg border border-gray-200 bg-white space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Name <span className="text-danger">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Priority</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Minimum Rank</label>
        <div className="relative w-64">
          <select value={minRankId} onChange={(e) => setMinRankId(e.target.value)} className="w-full appearance-none px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500">
            <option value="">No rank requirement</option>
            {ranks.map((r) => <option key={r.id} value={r.id}>{r.name} (order {r.sortOrder})</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>
      <RequirementEditor reqs={reqs} setReqs={setReqs} certTypes={certTypes} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors">
          {busy ? '…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors">Cancel</button>
      </div>
    </form>
  )
}

function PositionsPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { ranks, certTypes, positions: initialPositions } = Route.useLoaderData()

  const [positions, setPositions] = useState<PositionView[]>(initialPositions)

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addMinRankId, setAddMinRankId] = useState('')
  const [addSortOrder, setAddSortOrder] = useState(positions.length + 1)
  const [addRequirements, setAddRequirements] = useState<Array<{ certTypeId: string; minCertLevelId: string }>>([])
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editMinRankId, setEditMinRankId] = useState('')
  const [editSortOrder, setEditSortOrder] = useState(0)
  const [editRequirements, setEditRequirements] = useState<Array<{ certTypeId: string; minCertLevelId: string }>>([])
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function startEdit(p: PositionView) {
    setEditingId(p.id)
    setEditName(p.name)
    setEditDescription(p.description ?? '')
    setEditMinRankId(p.minRankId ?? '')
    setEditSortOrder(p.sortOrder)
    setEditRequirements(p.requirements.map((r) => ({ certTypeId: r.certTypeId, minCertLevelId: r.minCertLevelId ?? '' })))
    setEditError(null)
  }

  async function handleAdd(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddError(null)
    const name = addName.trim()
    if (!name) { setAddError('Name is required.'); return }
    setAddBusy(true)
    try {
      const result = await createPositionServerFn({
        data: {
          orgSlug: org.slug,
          name,
          description: addDescription.trim() || undefined,
          minRankId: addMinRankId || null,
          sortOrder: addSortOrder,
          requirements: addRequirements
            .filter((r) => r.certTypeId)
            .map((r) => ({ certTypeId: r.certTypeId, minCertLevelId: r.minCertLevelId || null })),
        },
      })
      if (result.success) {
        setPositions((prev) => [...prev, result.position].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
        setAddName(''); setAddDescription(''); setAddMinRankId('')
        setAddSortOrder((prev) => prev + 1); setAddRequirements([]); setShowAdd(false)
      } else {
        setAddError(result.error === 'DUPLICATE' ? 'A position with this name already exists.' : 'Failed to create.')
      }
    } finally {
      setAddBusy(false)
    }
  }

  async function handleEdit(positionId: string) {
    setEditError(null)
    setEditBusy(true)
    try {
      const result = await updatePositionServerFn({
        data: {
          orgSlug: org.slug,
          positionId,
          name: editName.trim(),
          description: editDescription.trim() || null,
          minRankId: editMinRankId || null,
          sortOrder: editSortOrder,
          requirements: editRequirements
            .filter((r) => r.certTypeId)
            .map((r) => ({ certTypeId: r.certTypeId, minCertLevelId: r.minCertLevelId || null })),
        },
      })
      if (result.success) {
        const listResult = await listPositionsServerFn({ data: { orgSlug: org.slug } })
        if (listResult.success) setPositions(listResult.positions)
        setEditingId(null)
      } else {
        setEditError(result.error === 'DUPLICATE' ? 'A position with this name already exists.' : 'Failed to update.')
      }
    } finally {
      setEditBusy(false)
    }
  }

  async function handleDelete(positionId: string) {
    setDeleteError(null)
    setDeleteBusy(positionId)
    try {
      const result = await deletePositionServerFn({ data: { orgSlug: org.slug, positionId } })
      if (result.success) {
        setPositions((prev) => prev.filter((p) => p.id !== positionId))
        setConfirmDelete(null)
      } else {
        setDeleteError(result.error === 'IN_USE' ? 'This position is used in shift assignments.' : 'Failed to delete.')
        setConfirmDelete(null)
      }
    } finally {
      setDeleteBusy(null)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-navy-700 mb-1">Positions</h1>
      <p className="text-sm text-gray-500 mb-6">
        Define named shift positions with rank and cert requirements. Lower priority number = shown first.
      </p>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Position
        </button>
      </div>

      {deleteError && (
        <div className="mb-3 text-sm text-danger bg-danger-bg border border-red-200 rounded-md px-3 py-2">{deleteError}</div>
      )}

      {showAdd && (
        <div className="mb-4">
          <PositionForm
            name={addName} setName={setAddName}
            description={addDescription} setDescription={setAddDescription}
            minRankId={addMinRankId} setMinRankId={setAddMinRankId}
            sortOrder={addSortOrder} setSortOrder={setAddSortOrder}
            reqs={addRequirements} setReqs={setAddRequirements}
            onSubmit={handleAdd} busy={addBusy} error={addError}
            onCancel={() => { setShowAdd(false); setAddError(null) }}
            submitLabel="Add Position"
            ranks={ranks} certTypes={certTypes}
          />
        </div>
      )}

      {positions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center">
          <p className="text-sm text-gray-500">No positions defined yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add a position to define shift roles with rank and cert requirements.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((p) => (
            <div key={p.id} className="group rounded-lg border border-gray-200 bg-white">
              {editingId === p.id ? (
                <div className="p-4">
                  <PositionForm
                    name={editName} setName={setEditName}
                    description={editDescription} setDescription={setEditDescription}
                    minRankId={editMinRankId} setMinRankId={setEditMinRankId}
                    sortOrder={editSortOrder} setSortOrder={setEditSortOrder}
                    reqs={editRequirements} setReqs={setEditRequirements}
                    onSubmit={(e) => { e.preventDefault(); void handleEdit(p.id) }}
                    busy={editBusy} error={editError}
                    onCancel={() => { setEditingId(null); setEditError(null) }}
                    submitLabel="Save"
                    ranks={ranks} certTypes={certTypes}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3 px-4 py-4">
                  <PriorityBadge priority={p.sortOrder} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-navy-700 text-base">{p.name}</div>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                    {(p.minRankName || p.requirements.length > 0) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {p.minRankName && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 text-xs font-semibold border border-navy-100"
                            style={{ fontFamily: 'var(--font-condensed)' }}
                          >
                            {p.minRankName}+
                          </span>
                        )}
                        {p.requirements.map((r, i) => (
                          <CertChip
                            key={i}
                            label={`${r.certTypeName}${r.minCertLevelName ? ` ≥${r.minCertLevelName}` : ''}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`flex items-center gap-1.5 transition-opacity ${confirmDelete === p.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Link
                      to="/orgs/$orgSlug/qualifications/positions/$positionId"
                      params={{ orgSlug: org.slug, positionId: p.id }}
                      className="px-2.5 py-1 bg-navy-50 hover:bg-navy-100 text-navy-700 border border-navy-100 rounded-md text-xs font-semibold transition-colors"
                    >
                      Eligibility
                    </Link>
                    <div className="w-px h-3.5 bg-gray-200 shrink-0" />
                    <button onClick={() => startEdit(p)} className="p-1 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-3.5 bg-gray-200 shrink-0" />
                    {confirmDelete === p.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => void handleDelete(p.id)} disabled={deleteBusy === p.id} className="px-2 py-0.5 bg-danger text-white rounded text-xs">
                          {deleteBusy === p.id ? '…' : 'Yes'}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(p.id)} className="p-1 text-gray-400 hover:text-danger hover:bg-danger-bg rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
