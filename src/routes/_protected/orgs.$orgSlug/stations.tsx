import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { StationView } from '@/lib/station.types'
import {
  listStationsServerFn,
  createStationServerFn,
  updateStationServerFn,
  deleteStationServerFn,
} from '@/server/stations'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/stations')({
  head: () => ({
    meta: [{ title: 'Stations | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const result = await listStationsServerFn({ data: { orgSlug: params.orgSlug } })
    return {
      stations: result.success ? result.stations : [],
      orgSlug: params.orgSlug,
    }
  },
  component: StationsPage,
})

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-success-bg text-success',
  inactive: 'bg-gray-100 text-gray-500',
}

const ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You don't have permission to manage stations.",
  DUPLICATE_NAME: 'A station with this name already exists.',
  DUPLICATE_CODE: 'A station with this code already exists.',
  VALIDATION_ERROR: 'Please check your input.',
  NOT_FOUND: 'Station not found.',
  HAS_ASSIGNMENTS: 'Cannot delete a station with assigned staff or assets.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
}

type FormState = {
  name: string
  code: string
  address: string
}

const EMPTY_FORM: FormState = { name: '', code: '', address: '' }

function StationsPage() {
  const { userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { stations: initialStations, orgSlug } = Route.useLoaderData()
  const [stations, setStations] = useState<StationView[]>(initialStations)
  const canManage = canDo(userRole, 'manage-stations')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(station: StationView) {
    setEditingId(station.id)
    setForm({
      name: station.name,
      code: station.code ?? '',
      address: station.address ?? '',
    })
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormBusy(true)
    setFormError('')

    if (editingId) {
      const result = await updateStationServerFn({
        data: {
          orgSlug,
          stationId: editingId,
          name: form.name,
          code: form.code || undefined,
          address: form.address || undefined,
        },
      })
      setFormBusy(false)
      if (result.success) {
        setStations((prev) =>
          prev.map((s) => (s.id === editingId ? result.station : s)),
        )
        closeForm()
      } else {
        setFormError(
          ('message' in result && result.message) || ERROR_MESSAGES[result.error] || result.error,
        )
      }
    } else {
      const result = await createStationServerFn({
        data: {
          orgSlug,
          name: form.name,
          code: form.code || undefined,
          address: form.address || undefined,
        },
      })
      setFormBusy(false)
      if (result.success) {
        setStations((prev) => [...prev, result.station])
        closeForm()
      } else {
        setFormError(
          ('message' in result && result.message) || ERROR_MESSAGES[result.error] || result.error,
        )
      }
    }
  }

  async function handleDelete(stationId: string) {
    setDeleteBusy(true)
    const result = await deleteStationServerFn({ data: { orgSlug, stationId } })
    setDeleteBusy(false)
    setConfirmDelete(null)
    if (result.success) {
      setStations((prev) => prev.filter((s) => s.id !== stationId))
    }
  }

  async function handleToggleStatus(station: StationView) {
    const newStatus = station.status === 'active' ? 'inactive' : 'active'
    const result = await updateStationServerFn({
      data: { orgSlug, stationId: station.id, status: newStatus },
    })
    if (result.success) {
      setStations((prev) =>
        prev.map((s) => (s.id === station.id ? result.station : s)),
      )
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-700">Stations</h1>
        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-700/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Station
          </button>
        )}
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-navy-700">
              {editingId ? 'Edit Station' : 'New Station'}
            </h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="station-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-danger">*</span>
              </label>
              <input
                id="station-name"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Station 1 - Downtown"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="station-code" className="block text-sm font-medium text-gray-700 mb-1">
                  Code
                </label>
                <input
                  id="station-code"
                  type="text"
                  maxLength={20}
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. STA-1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="station-address" className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <input
                  id="station-address"
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="e.g. 123 Main St"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                />
              </div>
            </div>

            {formError && (
              <p className="text-danger text-sm">{formError}</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={formBusy}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-700/90 transition-colors disabled:opacity-50"
              >
                {formBusy ? 'Saving...' : editingId ? 'Save Changes' : 'Create Station'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Station List */}
      {stations.length === 0 && !showForm ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500 mb-2">No stations yet.</p>
          {canManage && (
            <p className="text-gray-400 text-sm">
              Add your first station to start organizing your facilities.
            </p>
          )}
        </div>
      ) : stations.length > 0 ? (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Address</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
                {canManage && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => (
                <tr
                  key={station.id}
                  className="border-b border-gray-200 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{station.name}</td>
                  <td className="px-4 py-3 text-gray-500">{station.code ?? '\u2014'}</td>
                  <td className="px-4 py-3 text-gray-500">{station.address ?? '\u2014'}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <button
                        onClick={() => void handleToggleStatus(station)}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide cursor-pointer hover:opacity-80 ${STATUS_BADGE[station.status]}`}
                        style={{ fontFamily: 'var(--font-condensed)' }}
                      >
                        {station.status}
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${STATUS_BADGE[station.status]}`}
                        style={{ fontFamily: 'var(--font-condensed)' }}
                      >
                        {station.status}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(station)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-navy-700 hover:bg-gray-100 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDelete === station.id ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-danger">Delete?</span>
                            <button
                              onClick={() => void handleDelete(station.id)}
                              disabled={deleteBusy}
                              className="px-2 py-0.5 rounded-md bg-danger hover:opacity-90 text-white disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(station.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-danger hover:bg-gray-100 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
