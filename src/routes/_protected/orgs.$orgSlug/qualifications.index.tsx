import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Award, Star, Briefcase, X, Check } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { RankView, CertTypeView, CertLevelView, PositionView } from '@/lib/qualifications.types'
import {
  listRanksServerFn,
  createRankServerFn,
  updateRankServerFn,
  deleteRankServerFn,
  listCertTypesServerFn,
  createCertTypeServerFn,
  updateCertTypeServerFn,
  upsertCertLevelsServerFn,
  deleteCertTypeServerFn,
  listPositionsServerFn,
  createPositionServerFn,
  updatePositionServerFn,
  deletePositionServerFn,
} from '@/server/qualifications'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/qualifications/')({
  head: () => ({
    meta: [{ title: 'Qualifications | Scene Ready' }],
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
  component: QualificationsPage,
})

type Tab = 'ranks' | 'certTypes' | 'positions'

// ---------------------------------------------------------------------------
// Ranks tab
// ---------------------------------------------------------------------------

function RanksTab({
  orgSlug,
  canManage,
  initialRanks,
}: {
  orgSlug: string
  canManage: boolean
  initialRanks: RankView[]
}) {
  const [ranks, setRanks] = useState<RankView[]>(initialRanks)
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addSortOrder, setAddSortOrder] = useState(ranks.length + 1)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSortOrder, setEditSortOrder] = useState(1)
  const [editBusy, setEditBusy] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    const name = addName.trim()
    if (!name) { setAddError('Name is required.'); return }
    if (addSortOrder < 1) { setAddError('Sort order must be at least 1.'); return }
    setAddBusy(true)
    try {
      const result = await createRankServerFn({ data: { orgSlug, name, sortOrder: addSortOrder } })
      if (result.success) {
        setRanks((prev) => [...prev, result.rank].sort((a, b) => a.sortOrder - b.sortOrder))
        setAddName('')
        setAddSortOrder(ranks.length + 2)
        setShowAdd(false)
      } else {
        setAddError(result.error === 'DUPLICATE' ? 'A rank with this name already exists.' : 'Failed to create rank.')
      }
    } finally {
      setAddBusy(false)
    }
  }

  function startEdit(r: RankView) {
    setEditingId(r.id)
    setEditName(r.name)
    setEditSortOrder(r.sortOrder)
  }

  async function handleEdit(rankId: string) {
    setEditBusy(true)
    try {
      const result = await updateRankServerFn({
        data: { orgSlug, rankId, name: editName.trim(), sortOrder: editSortOrder },
      })
      if (result.success) {
        setRanks((prev) =>
          prev
            .map((r) => r.id === rankId ? { ...r, name: editName.trim(), sortOrder: editSortOrder } : r)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        )
        setEditingId(null)
      }
    } finally {
      setEditBusy(false)
    }
  }

  async function handleDelete(rankId: string) {
    setDeleteError(null)
    setDeleteBusy(rankId)
    try {
      const result = await deleteRankServerFn({ data: { orgSlug, rankId } })
      if (result.success) {
        setRanks((prev) => prev.filter((r) => r.id !== rankId))
        setConfirmDelete(null)
      } else {
        setDeleteError(result.error === 'IN_USE' ? 'This rank is assigned to staff or positions.' : 'Failed to delete.')
        setConfirmDelete(null)
      }
    } finally {
      setDeleteBusy(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Define your organization's rank hierarchy. Higher sort order = more senior.</p>
        {canManage && (
          <button
            onClick={() => { setShowAdd(true); setAddSortOrder(ranks.length + 1) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Rank
          </button>
        )}
      </div>

      {deleteError && (
        <div className="mb-3 text-sm text-danger bg-danger-bg border border-red-200 rounded-md px-3 py-2">{deleteError}</div>
      )}

      {showAdd && canManage && (
        <form onSubmit={handleAdd} className="mb-4 p-5 rounded-lg border border-gray-200 bg-white flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
            <input
              autoFocus
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="e.g. Captain"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
            />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-600 mb-1">Sort Order</label>
            <input
              type="number"
              min={1}
              value={addSortOrder}
              onChange={(e) => setAddSortOrder(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={addBusy} className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors">
              {addBusy ? '…' : 'Add'}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setAddError(null) }} className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors">Cancel</button>
          </div>
          {addError && <p className="text-sm text-danger mt-1">{addError}</p>}
        </form>
      )}

      {ranks.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center">
          <p className="text-sm text-gray-500">No ranks defined yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add a rank to define your organization's hierarchy.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide w-32" style={{ fontFamily: 'var(--font-condensed)' }}>Sort Order</th>
                {canManage && <th className="w-24" />}
              </tr>
            </thead>
            <tbody>
              {ranks.map((r) => (
                <tr key={r.id} className="group border-b border-gray-200 last:border-0 hover:bg-gray-50">
                  {editingId === r.id ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={1}
                          value={editSortOrder}
                          onChange={(e) => setEditSortOrder(parseInt(e.target.value) || 1)}
                          className="w-24 px-2 py-1 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => void handleEdit(r.id)} disabled={editBusy} className="p-1 text-success hover:bg-success-bg rounded">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-navy-700">{r.name}</td>
                      <td className="px-4 py-3 text-gray-500">{r.sortOrder}</td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-1.5 justify-end transition-opacity ${confirmDelete === r.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <button onClick={() => startEdit(r)} className="p-1 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-px h-3.5 bg-gray-200 shrink-0" />
                            {confirmDelete === r.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => void handleDelete(r.id)} disabled={deleteBusy === r.id} className="px-2 py-0.5 bg-danger text-white rounded text-xs">
                                  {deleteBusy === r.id ? '…' : 'Yes'}
                                </button>
                                <button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(r.id)} className="p-1 text-gray-400 hover:text-danger hover:bg-danger-bg rounded transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cert Types tab
// ---------------------------------------------------------------------------

function CertTypesTab({
  orgSlug,
  canManage,
  initialCertTypes,
}: {
  orgSlug: string
  canManage: boolean
  initialCertTypes: CertTypeView[]
}) {
  const [certTypes, setCertTypes] = useState<CertTypeView[]>(initialCertTypes)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addIsLeveled, setAddIsLeveled] = useState(false)
  const [addLevels, setAddLevels] = useState<Array<{ name: string; levelOrder: number }>>([{ name: '', levelOrder: 1 }])
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Edit name/description
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  // Edit levels
  const [editingLevelsId, setEditingLevelsId] = useState<string | null>(null)
  const [editLevels, setEditLevels] = useState<Array<{ name: string; levelOrder: number }>>([])
  const [editLevelsBusy, setEditLevelsBusy] = useState(false)
  const [editLevelsError, setEditLevelsError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function addLevelRow() {
    setAddLevels((prev) => [...prev, { name: '', levelOrder: prev.length + 1 }])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    const name = addName.trim()
    if (!name) { setAddError('Name is required.'); return }
    if (addIsLeveled && addLevels.some((l) => !l.name.trim())) {
      setAddError('All level names are required.'); return
    }
    setAddBusy(true)
    try {
      const result = await createCertTypeServerFn({
        data: {
          orgSlug,
          name,
          description: addDescription.trim() || undefined,
          isLeveled: addIsLeveled,
          levels: addIsLeveled ? addLevels.filter((l) => l.name.trim()) : undefined,
        },
      })
      if (result.success) {
        setCertTypes((prev) => [...prev, result.certType].sort((a, b) => a.name.localeCompare(b.name)))
        setAddName(''); setAddDescription(''); setAddIsLeveled(false)
        setAddLevels([{ name: '', levelOrder: 1 }]); setShowAdd(false)
      } else {
        setAddError(result.error === 'DUPLICATE' ? 'A cert type with this name already exists.' : 'Failed to create.')
      }
    } finally {
      setAddBusy(false)
    }
  }

  async function handleEditName(certTypeId: string) {
    setEditBusy(true)
    try {
      const result = await updateCertTypeServerFn({
        data: { orgSlug, certTypeId, name: editName.trim(), description: editDescription.trim() || null },
      })
      if (result.success) {
        setCertTypes((prev) =>
          prev.map((ct) =>
            ct.id === certTypeId ? { ...ct, name: editName.trim(), description: editDescription.trim() || null } : ct,
          ),
        )
        setEditingId(null)
      }
    } finally {
      setEditBusy(false)
    }
  }

  async function handleSaveLevels(certTypeId: string) {
    setEditLevelsError(null)
    if (editLevels.some((l) => !l.name.trim())) {
      setEditLevelsError('All level names are required.'); return
    }
    setEditLevelsBusy(true)
    try {
      const result = await upsertCertLevelsServerFn({
        data: { orgSlug, certTypeId, levels: editLevels.filter((l) => l.name.trim()) },
      })
      if (result.success) {
        setCertTypes((prev) =>
          prev.map((ct) => ct.id === certTypeId ? { ...ct, levels: result.levels } : ct),
        )
        setEditingLevelsId(null)
      } else {
        setEditLevelsError(result.error === 'LEVELS_IN_USE' ? 'Some levels are in use and cannot be removed.' : 'Failed to update levels.')
      }
    } finally {
      setEditLevelsBusy(false)
    }
  }

  async function handleDelete(certTypeId: string) {
    setDeleteError(null)
    setDeleteBusy(certTypeId)
    try {
      const result = await deleteCertTypeServerFn({ data: { orgSlug, certTypeId } })
      if (result.success) {
        setCertTypes((prev) => prev.filter((ct) => ct.id !== certTypeId))
        setConfirmDelete(null)
      } else {
        setDeleteError(result.error === 'IN_USE' ? 'This cert type is assigned to staff and cannot be deleted.' : 'Failed to delete.')
        setConfirmDelete(null)
      }
    } finally {
      setDeleteBusy(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Define certification types your org tracks. Leveled types have ordered tiers (e.g. Level 1 &lt; Level 2).</p>
        {canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Cert Type
          </button>
        )}
      </div>

      {deleteError && (
        <div className="mb-3 text-sm text-danger bg-danger-bg border border-red-200 rounded-md px-3 py-2">{deleteError}</div>
      )}

      {showAdd && canManage && (
        <form onSubmit={handleAdd} className="mb-4 p-5 rounded-lg border border-gray-200 bg-white space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Name <span className="text-danger">*</span></label>
              <input autoFocus type="text" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. EMT Certification" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
              <input type="text" value={addDescription} onChange={(e) => setAddDescription(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={addIsLeveled} onChange={(e) => setAddIsLeveled(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">This cert type has ordered levels</span>
          </label>
          {addIsLeveled && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Levels (lowest → highest)</p>
              {addLevels.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4">{l.levelOrder}</span>
                  <input
                    type="text"
                    value={l.name}
                    onChange={(e) => setAddLevels((prev) => prev.map((ll, ii) => ii === i ? { ...ll, name: e.target.value } : ll))}
                    placeholder={`Level ${l.levelOrder} name`}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
                  />
                  {addLevels.length > 1 && (
                    <button type="button" onClick={() => setAddLevels((prev) => prev.filter((_, ii) => ii !== i).map((ll, ii) => ({ ...ll, levelOrder: ii + 1 })))} className="text-gray-400 hover:text-danger">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addLevelRow} className="text-xs text-navy-600 hover:text-navy-800 font-medium">+ Add level</button>
            </div>
          )}
          {addError && <p className="text-sm text-danger">{addError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={addBusy} className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors">
              {addBusy ? '…' : 'Add'}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setAddError(null) }} className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {certTypes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center">
          <p className="text-sm text-gray-500">No certification types defined yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add a cert type to track staff certifications.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {certTypes.map((ct) => (
            <div key={ct.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              {editingId === ct.id ? (
                <div className="p-5 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
                    <input autoFocus type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                    <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void handleEditName(ct.id)} disabled={editBusy} className="p-2 text-success hover:bg-success-bg rounded">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(expandedId === ct.id ? null : ct.id)}
                >
                  <div className="flex items-center gap-3">
                    {ct.isLeveled ? <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === ct.id ? '' : '-rotate-90'}`} /> : <span className="w-4" />}
                    <div>
                      <span className="font-medium text-navy-700">{ct.name}</span>
                      {ct.description && <span className="ml-2 text-sm text-gray-500">{ct.description}</span>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${ct.isLeveled ? 'bg-navy-50 text-navy-700' : 'bg-gray-100 text-gray-600'}`} style={{ fontFamily: 'var(--font-condensed)' }}>
                      {ct.isLeveled ? `Leveled (${ct.levels.length})` : 'Simple'}
                    </span>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setEditingId(ct.id); setEditName(ct.name); setEditDescription(ct.description ?? '') }} className="p-1 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDelete === ct.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => void handleDelete(ct.id)} disabled={deleteBusy === ct.id} className="px-2 py-0.5 bg-danger text-white rounded text-xs">
                            {deleteBusy === ct.id ? '…' : 'Yes'}
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(ct.id)} className="p-1 text-gray-400 hover:text-danger hover:bg-danger-bg rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {expandedId === ct.id && ct.isLeveled && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  {editingLevelsId === ct.id ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>Edit Levels</p>
                      {editLevels.map((l, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-4">{l.levelOrder}</span>
                          <input
                            type="text"
                            value={l.name}
                            onChange={(e) => setEditLevels((prev) => prev.map((ll, ii) => ii === i ? { ...ll, name: e.target.value } : ll))}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
                          />
                          {editLevels.length > 1 && (
                            <button type="button" onClick={() => setEditLevels((prev) => prev.filter((_, ii) => ii !== i).map((ll, ii) => ({ ...ll, levelOrder: ii + 1 })))} className="text-gray-400 hover:text-danger">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => setEditLevels((prev) => [...prev, { name: '', levelOrder: prev.length + 1 }])} className="text-xs text-navy-600 hover:text-navy-800 font-medium">+ Add level</button>
                      {editLevelsError && <p className="text-sm text-danger">{editLevelsError}</p>}
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => void handleSaveLevels(ct.id)} disabled={editLevelsBusy} className="px-3 py-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-xs font-semibold">
                          {editLevelsBusy ? '…' : 'Save Levels'}
                        </button>
                        <button onClick={() => { setEditingLevelsId(null); setEditLevelsError(null) }} className="px-3 py-1.5 text-gray-500 hover:text-gray-900 text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Levels</p>
                        {canManage && (
                          <button
                            onClick={() => { setEditingLevelsId(ct.id); setEditLevels(ct.levels.map((l) => ({ name: l.name, levelOrder: l.levelOrder }))) }}
                            className="text-xs text-navy-600 hover:text-navy-800 font-medium flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" /> Edit levels
                          </button>
                        )}
                      </div>
                      {ct.levels.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No levels defined.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {ct.levels.map((l) => (
                            <span key={l.id} className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-xs text-gray-700 font-medium">
                              {l.levelOrder}. {l.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Positions tab
// ---------------------------------------------------------------------------

function PositionsTab({
  orgSlug,
  canManage,
  initialPositions,
  ranks,
  certTypes,
}: {
  orgSlug: string
  canManage: boolean
  initialPositions: PositionView[]
  ranks: RankView[]
  certTypes: CertTypeView[]
}) {
  const [positions, setPositions] = useState<PositionView[]>(initialPositions)

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addMinRankId, setAddMinRankId] = useState('')
  const [addSortOrder, setAddSortOrder] = useState(0)
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    const name = addName.trim()
    if (!name) { setAddError('Name is required.'); return }
    setAddBusy(true)
    try {
      const result = await createPositionServerFn({
        data: {
          orgSlug,
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
        setPositions((prev) => [...prev, result.position].sort((a, b) => b.sortOrder - a.sortOrder || a.name.localeCompare(b.name)))
        setAddName(''); setAddDescription(''); setAddMinRankId(''); setAddSortOrder(0); setAddRequirements([]); setShowAdd(false)
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
          orgSlug,
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
        // Refetch position to get updated requirements with names
        const listResult = await listPositionsServerFn({ data: { orgSlug } })
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
      const result = await deletePositionServerFn({ data: { orgSlug, positionId } })
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

  function RequirementEditor({
    reqs,
    setReqs,
  }: {
    reqs: Array<{ certTypeId: string; minCertLevelId: string }>
    setReqs: React.Dispatch<React.SetStateAction<Array<{ certTypeId: string; minCertLevelId: string }>>>
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
    sortOrder, setSortOrder,
    reqs, setReqs, onSubmit, busy, error, onCancel, submitLabel,
  }: {
    name: string; setName: (v: string) => void
    description: string; setDescription: (v: string) => void
    minRankId: string; setMinRankId: (v: string) => void
    sortOrder: number; setSortOrder: (v: number) => void
    reqs: Array<{ certTypeId: string; minCertLevelId: string }>
    setReqs: React.Dispatch<React.SetStateAction<Array<{ certTypeId: string; minCertLevelId: string }>>>
    onSubmit: (e: React.FormEvent) => void
    busy: boolean; error: string | null; onCancel: () => void; submitLabel: string
  }) {
    return (
      <form onSubmit={onSubmit} className="p-5 rounded-lg border border-gray-200 bg-white space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Name <span className="text-danger">*</span></label>
            <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500" />
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
        <RequirementEditor reqs={reqs} setReqs={setReqs} />
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Define named shift positions with rank and cert requirements.</p>
        {canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Position
          </button>
        )}
      </div>

      {deleteError && (
        <div className="mb-3 text-sm text-danger bg-danger-bg border border-red-200 rounded-md px-3 py-2">{deleteError}</div>
      )}

      {showAdd && canManage && (
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
          />
        </div>
      )}

      {positions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center">
          <p className="text-sm text-gray-500">No positions defined yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add a position to define shift roles with rank and cert requirements.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide w-20" style={{ fontFamily: 'var(--font-condensed)' }}>Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Min Rank</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Cert Requirements</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="group border-b border-gray-200 last:border-0 hover:bg-gray-50 align-top">
                  {editingId === p.id ? (
                    <td colSpan={5} className="px-4 py-3">
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
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-navy-700">{p.name}</span>
                          {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{p.sortOrder}</td>
                      <td className="px-4 py-3 text-gray-600">{p.minRankName ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        {p.requirements.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {p.requirements.map((r, i) => (
                              <span key={i} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                                {r.certTypeName}{r.minCertLevelName ? ` (≥${r.minCertLevelName})` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-1.5 justify-end transition-opacity ${confirmDelete === p.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <Link
                            to="/orgs/$orgSlug/qualifications/positions/$positionId"
                            params={{ orgSlug, positionId: p.id }}
                            className="p-1 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded transition-colors"
                            title="View eligibility"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                          {canManage && (
                            <>
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
                            </>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function QualificationsPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { ranks, certTypes, positions } = Route.useLoaderData()
  const [activeTab, setActiveTab] = useState<Tab>('ranks')
  const canManage = canDo(userRole, 'manage-certifications')

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'ranks', label: 'Ranks', icon: <Star className="w-4 h-4" /> },
    { id: 'certTypes', label: 'Cert Types', icon: <Award className="w-4 h-4" /> },
    { id: 'positions', label: 'Positions', icon: <Briefcase className="w-4 h-4" /> },
  ]

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-700 mb-1">Qualifications</h1>
        <p className="text-gray-500 text-sm">Manage ranks, certifications, and named shift positions for {org.name}.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-red-700 text-red-700'
                : 'border-transparent text-gray-500 hover:text-navy-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'ranks' && (
        <RanksTab orgSlug={org.slug} canManage={canManage} initialRanks={ranks} />
      )}
      {activeTab === 'certTypes' && (
        <CertTypesTab orgSlug={org.slug} canManage={canManage} initialCertTypes={certTypes} />
      )}
      {activeTab === 'positions' && (
        <PositionsTab
          orgSlug={org.slug}
          canManage={canManage}
          initialPositions={positions}
          ranks={ranks}
          certTypes={certTypes}
        />
      )}
    </div>
  )
}
