import { useState } from 'react'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { Plus, Pencil, Trash2, ChevronDown, X, Check } from 'lucide-react'
import type { CertTypeView } from '@/lib/qualifications.types'
import {
  listCertTypesServerFn,
  createCertTypeServerFn,
  updateCertTypeServerFn,
  upsertCertLevelsServerFn,
  deleteCertTypeServerFn,
} from '@/server/qualifications'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/settings/cert-types')({
  head: () => ({
    meta: [{ title: 'Cert Types | Settings | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const result = await listCertTypesServerFn({ data: { orgSlug: params.orgSlug } })
    return { certTypes: result.success ? result.certTypes : [] }
  },
  component: CertTypesPage,
})

function CertTypesPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { certTypes: initialCertTypes } = Route.useLoaderData()

  const [certTypes, setCertTypes] = useState<CertTypeView[]>(initialCertTypes)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addIsLeveled, setAddIsLeveled] = useState(false)
  const [addLevels, setAddLevels] = useState<Array<{ name: string; levelOrder: number }>>([{ name: '', levelOrder: 1 }])
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const [editingLevelsId, setEditingLevelsId] = useState<string | null>(null)
  const [editLevels, setEditLevels] = useState<Array<{ name: string; levelOrder: number }>>([])
  const [editLevelsBusy, setEditLevelsBusy] = useState(false)
  const [editLevelsError, setEditLevelsError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleAdd(e: React.SubmitEvent<HTMLFormElement>) {
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
          orgSlug: org.slug,
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
        data: { orgSlug: org.slug, certTypeId, name: editName.trim(), description: editDescription.trim() || null },
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
        data: { orgSlug: org.slug, certTypeId, levels: editLevels.filter((l) => l.name.trim()) },
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
      const result = await deleteCertTypeServerFn({ data: { orgSlug: org.slug, certTypeId } })
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
      <h1 className="text-xl font-bold text-navy-700 mb-1">Cert Types</h1>
      <p className="text-sm text-gray-500 mb-6">
        Define certification types your org tracks. Leveled types have ordered tiers (e.g. Level 1 &lt; Level 2).
      </p>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Cert Type
        </button>
      </div>

      {deleteError && (
        <div className="mb-3 text-sm text-danger bg-danger-bg border border-red-200 rounded-md px-3 py-2">{deleteError}</div>
      )}

      {showAdd && (
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
              <button type="button" onClick={() => setAddLevels((prev) => [...prev, { name: '', levelOrder: prev.length + 1 }])} className="text-xs text-navy-600 hover:text-navy-800 font-medium">+ Add level</button>
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
            <div key={ct.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden border-l-4 border-l-navy-500">
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
                      <span className="font-semibold text-navy-700">{ct.name}</span>
                      {ct.description && <span className="ml-2 text-sm text-gray-500">{ct.description}</span>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${ct.isLeveled ? 'bg-navy-50 text-navy-700' : 'bg-gray-100 text-gray-600'}`} style={{ fontFamily: 'var(--font-condensed)' }}>
                      {ct.isLeveled ? `Leveled (${ct.levels.length})` : 'Simple'}
                    </span>
                  </div>
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
                        <button
                          onClick={() => { setEditingLevelsId(ct.id); setEditLevels(ct.levels.map((l) => ({ name: l.name, levelOrder: l.levelOrder }))) }}
                          className="text-xs text-navy-600 hover:text-navy-800 font-medium flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" /> Edit levels
                        </button>
                      </div>
                      {ct.levels.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No levels defined.</p>
                      ) : (
                        <div className="flex items-center gap-0 flex-wrap">
                          {ct.levels.map((l, i) => (
                            <div key={l.id} className="flex items-center">
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 first:rounded-l-full last:rounded-r-full text-xs">
                                <span
                                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-navy-700 text-white font-bold shrink-0"
                                  style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
                                >
                                  {l.levelOrder}
                                </span>
                                <span className="text-gray-700 font-medium">{l.name}</span>
                              </div>
                              {i < ct.levels.length - 1 && <div className="w-3 h-px bg-gray-300 shrink-0" />}
                            </div>
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
