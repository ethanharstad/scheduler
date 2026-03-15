import { useState } from 'react'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import type { RankView } from '@/lib/qualifications.types'
import {
  listRanksServerFn,
  createRankServerFn,
  updateRankServerFn,
  deleteRankServerFn,
} from '@/server/qualifications'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/settings/ranks')({
  head: () => ({
    meta: [{ title: 'Ranks | Settings | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const result = await listRanksServerFn({ data: { orgSlug: params.orgSlug } })
    return { ranks: result.success ? result.ranks : [] }
  },
  component: RanksPage,
})

function RankBadge({ order }: { order: number }) {
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-navy-700 text-white text-sm font-bold shrink-0"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {order}
    </span>
  )
}

function RanksPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { ranks: initialRanks } = Route.useLoaderData()

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

  async function handleAdd(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddError(null)
    const name = addName.trim()
    if (!name) { setAddError('Name is required.'); return }
    if (addSortOrder < 1) { setAddError('Sort order must be at least 1.'); return }
    setAddBusy(true)
    try {
      const result = await createRankServerFn({ data: { orgSlug: org.slug, name, sortOrder: addSortOrder } })
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
        data: { orgSlug: org.slug, rankId, name: editName.trim(), sortOrder: editSortOrder },
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
      const result = await deleteRankServerFn({ data: { orgSlug: org.slug, rankId } })
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
      <h1 className="text-xl font-bold text-navy-700 mb-1">Ranks</h1>
      <p className="text-sm text-gray-500 mb-6">Define your organization's rank hierarchy. Higher sort order = more senior.</p>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setShowAdd(true); setAddSortOrder(ranks.length + 1) }}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Rank
        </button>
      </div>

      {deleteError && (
        <div className="mb-3 text-sm text-danger bg-danger-bg border border-red-200 rounded-md px-3 py-2">{deleteError}</div>
      )}

      {showAdd && (
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
        <div className="space-y-2">
          {ranks.map((r) => (
            <div key={r.id} className="group flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white hover:border-navy-100">
              {editingId === r.id ? (
                <>
                  <RankBadge order={r.sortOrder} />
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                  />
                  <input
                    type="number"
                    min={1}
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                  />
                  <div className="flex items-center gap-1">
                    <button onClick={() => void handleEdit(r.id)} disabled={editBusy} className="p-1 text-success hover:bg-success-bg rounded">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <RankBadge order={r.sortOrder} />
                  <span className="flex-1 font-semibold text-navy-700">{r.name}</span>
                  <div className={`flex items-center gap-1.5 transition-opacity ${confirmDelete === r.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
