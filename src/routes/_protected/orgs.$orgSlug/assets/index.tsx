import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { Plus, AlertTriangle, Clock, Search, Filter } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { AssetView } from '@/lib/asset.types'
import {
  listAssetsServerFn,
  getExpiringAssetsServerFn,
  getOverdueInspectionsServerFn,
} from '@/server/assets'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets/')({
  head: () => ({
    meta: [{ title: 'Assets | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const [assetsResult, expiringResult, overdueResult] = await Promise.all([
      listAssetsServerFn({ data: { orgSlug: params.orgSlug } }),
      getExpiringAssetsServerFn({ data: { orgSlug: params.orgSlug } }),
      getOverdueInspectionsServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      assets: assetsResult.success ? assetsResult.assets : [],
      total: assetsResult.success ? assetsResult.total : 0,
      expiring: expiringResult.success ? expiringResult.assets : [],
      overdue: overdueResult.success ? overdueResult.assets : [],
    }
  },
  component: AssetsPage,
})

const TYPE_TABS = [
  { value: '', label: 'All' },
  { value: 'apparatus', label: 'Apparatus' },
  { value: 'gear', label: 'Gear' },
]

const APPARATUS_STATUS_LABELS: Record<string, string> = {
  in_service: 'In Service',
  out_of_service: 'Out of Service',
  reserve: 'Reserve',
  decommissioned: 'Decommissioned',
}

const GEAR_STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  assigned: 'Assigned',
  out_of_service: 'Out of Service',
  decommissioned: 'Decommissioned',
  expired: 'Expired',
}

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'Engine',
  ladder_truck: 'Ladder Truck',
  ambulance_medic: 'Ambulance/Medic',
  battalion_chief: 'Battalion Chief',
  rescue: 'Rescue',
  brush_wildland: 'Brush/Wildland',
  tanker_tender: 'Tanker/Tender',
  boat: 'Boat',
  atv_utv: 'ATV/UTV',
  command_vehicle: 'Command Vehicle',
  utility: 'Utility',
  scba: 'SCBA',
  ppe: 'PPE',
  radio: 'Radio',
  medical_equipment: 'Medical Equipment',
  tools: 'Tools',
  hose: 'Hose',
  nozzle: 'Nozzle',
  thermal_camera: 'Thermal Camera',
  gas_detector: 'Gas Detector',
  lighting: 'Lighting',
  extrication: 'Extrication',
  rope_rescue: 'Rope Rescue',
  water_rescue: 'Water Rescue',
  hazmat: 'HazMat',
  other: 'Other',
}

function statusLabel(asset: AssetView): string {
  const map = asset.assetType === 'apparatus' ? APPARATUS_STATUS_LABELS : GEAR_STATUS_LABELS
  return map[asset.status] ?? asset.status
}

function statusBadge(asset: AssetView) {
  const label = statusLabel(asset)
  const cls =
    asset.status === 'in_service' || asset.status === 'available'
      ? 'bg-success-bg text-success'
      : asset.status === 'decommissioned' || asset.status === 'expired'
        ? 'bg-gray-100 text-gray-500'
        : asset.status === 'out_of_service'
          ? 'bg-warning-bg text-warning'
          : 'bg-blue-50 text-blue-700'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${cls}`}
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {label}
    </span>
  )
}

function expirationBadge(asset: AssetView) {
  if (!asset.expirationDate) return null
  const today = new Date()
  const exp = new Date(asset.expirationDate)
  const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) {
    return (
      <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-bg text-danger" style={{ fontFamily: 'var(--font-condensed)' }}>
        EXPIRED
      </span>
    )
  }
  if (daysLeft <= 30) {
    return (
      <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-bg text-warning" style={{ fontFamily: 'var(--font-condensed)' }}>
        {daysLeft}d left
      </span>
    )
  }
  return null
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  const d = new Date(dateStr)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function AlertsSection({
  expiring,
  overdue,
  orgSlug,
}: {
  expiring: AssetView[]
  overdue: AssetView[]
  orgSlug: string
}) {
  const [open, setOpen] = useState(expiring.length > 0 || overdue.length > 0)

  if (expiring.length === 0 && overdue.length === 0) return null

  return (
    <div className="mb-6 border border-amber-200 rounded-lg bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Compliance Alerts
          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-200 text-amber-800">
            {expiring.length + overdue.length}
          </span>
        </div>
        <span className="text-amber-600 text-xs">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {expiring.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                Expiring Soon ({expiring.length})
              </h4>
              <ul className="space-y-1">
                {expiring.map((a) => {
                  const d = daysUntil(a.expirationDate!)
                  return (
                    <li key={a.id} className="flex items-center justify-between text-sm">
                      <Link
                        to="/orgs/$orgSlug/assets/$assetId"
                        params={{ orgSlug, assetId: a.id }}
                        className="text-navy-700 hover:underline truncate"
                      >
                        {a.name}
                      </Link>
                      <span className={`ml-2 text-xs font-medium ${d < 0 ? 'text-danger' : 'text-warning'}`}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {overdue.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2" style={{ fontFamily: 'var(--font-condensed)' }}>
                Overdue Inspections ({overdue.length})
              </h4>
              <ul className="space-y-1">
                {overdue.map((a) => {
                  const d = daysUntil(a.nextInspectionDue!)
                  return (
                    <li key={a.id} className="flex items-center justify-between text-sm">
                      <Link
                        to="/orgs/$orgSlug/assets/$assetId"
                        params={{ orgSlug, assetId: a.id }}
                        className="text-navy-700 hover:underline truncate"
                      >
                        {a.name}
                      </Link>
                      <span className={`ml-2 text-xs font-medium ${d < 0 ? 'text-danger' : 'text-warning'}`}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : `due in ${d}d`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AssetsPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { assets: initialAssets, total: initialTotal, expiring, overdue } = Route.useLoaderData()

  const [assets, setAssets] = useState<AssetView[]>(initialAssets)
  const [total, setTotal] = useState(initialTotal)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)

  const canManage = canDo(userRole, 'manage-assets')
  const limit = 50

  async function applyFilters(opts?: {
    type?: string; status?: string; category?: string; search?: string; offset?: number
  }) {
    const t = opts?.type ?? typeFilter
    const s = opts?.status ?? statusFilter
    const c = opts?.category ?? categoryFilter
    const q = opts?.search ?? search
    const o = opts?.offset ?? 0
    setLoading(true)
    try {
      const result = await listAssetsServerFn({
        data: {
          orgSlug: org.slug,
          assetType: t ? (t as 'apparatus' | 'gear') : undefined,
          status: s || undefined,
          category: c || undefined,
          search: q || undefined,
          limit,
          offset: o,
        },
      })
      if (result.success) {
        setAssets(result.assets)
        setTotal(result.total)
        setOffset(o)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleTypeChange(t: string) {
    setTypeFilter(t)
    setStatusFilter('')
    setCategoryFilter('')
    void applyFilters({ type: t, status: '', category: '' })
  }

  const myGearLink = (
    <Link
      to="/orgs/$orgSlug/assets/my-gear"
      params={{ orgSlug: org.slug }}
      className="text-sm text-navy-600 hover:text-navy-800 font-medium underline"
    >
      My Gear
    </Link>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-sans)' }}>
            Assets
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{myGearLink}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <Link
              to="/orgs/$orgSlug/assets/new"
              params={{ orgSlug: org.slug }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Asset
            </Link>
          )}
        </div>
      </div>

      {/* Compliance alerts */}
      <AlertsSection expiring={expiring} overdue={overdue} orgSlug={org.slug} />

      {/* Type tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTypeChange(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              typeFilter === tab.value
                ? 'border-red-700 text-red-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, unit, serial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void applyFilters() }}
            className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600 w-56"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); void applyFilters({ status: e.target.value }) }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy-600"
          >
            <option value="">All Statuses</option>
            {typeFilter !== 'gear' && (
              <>
                <option value="in_service">In Service</option>
                <option value="out_of_service">Out of Service</option>
                <option value="reserve">Reserve</option>
                <option value="decommissioned">Decommissioned</option>
              </>
            )}
            {typeFilter !== 'apparatus' && (
              <>
                <option value="available">Available</option>
                <option value="assigned">Assigned</option>
                <option value="expired">Expired</option>
              </>
            )}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); void applyFilters({ category: e.target.value }) }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy-600"
          >
            <option value="">All Categories</option>
            {typeFilter !== 'gear' && (
              <optgroup label="Apparatus">
                {Object.entries(CATEGORY_LABELS).filter(([k]) =>
                  ['engine','ladder_truck','ambulance_medic','battalion_chief','rescue','brush_wildland','tanker_tender','boat','atv_utv','command_vehicle','utility','other'].includes(k)
                ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </optgroup>
            )}
            {typeFilter !== 'apparatus' && (
              <optgroup label="Gear">
                {Object.entries(CATEGORY_LABELS).filter(([k]) =>
                  ['scba','ppe','radio','medical_equipment','tools','hose','nozzle','thermal_camera','gas_detector','lighting','extrication','rope_rescue','water_rescue','hazmat','other'].includes(k)
                ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            onClick={() => void applyFilters()}
            className="px-3 py-2 text-sm font-medium bg-navy-700 text-white rounded-lg hover:bg-navy-800 transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : assets.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">No assets found.</p>
            {canManage && (
              <Link
                to="/orgs/$orgSlug/assets/new"
                params={{ orgSlug: org.slug }}
                className="mt-3 inline-flex items-center gap-1 text-sm text-red-700 hover:text-red-800 font-medium"
              >
                <Plus className="w-4 h-4" />
                Add your first asset
              </Link>
            )}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Unit / Serial</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>
                    <Clock className="w-3 h-3 inline mr-1" />
                    Inspection Due
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assets.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to="/orgs/$orgSlug/assets/$assetId"
                        params={{ orgSlug: org.slug, assetId: a.id }}
                        className="font-medium text-navy-700 hover:underline"
                      >
                        {a.name}
                      </Link>
                      {expirationBadge(a)}
                      {a.assetType === 'gear' && a.assignedToStaffName && (
                        <span className="ml-2 text-xs text-gray-400">→ {a.assignedToStaffName}</span>
                      )}
                      {a.assetType === 'gear' && a.assignedToApparatusName && (
                        <span className="ml-2 text-xs text-gray-400">→ {a.assignedToApparatusName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600">{a.assetType}</td>
                    <td className="px-4 py-3 text-gray-600">{CATEGORY_LABELS[a.category] ?? a.category}</td>
                    <td className="px-4 py-3">{statusBadge(a)}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {a.unitNumber ?? a.serialNumber ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {a.nextInspectionDue ? (
                        <span className={daysUntil(a.nextInspectionDue) < 0 ? 'text-danger font-medium' : daysUntil(a.nextInspectionDue) <= 7 ? 'text-warning font-medium' : ''}>
                          {a.nextInspectionDue}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {total > limit && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                <div className="flex gap-2">
                  {offset > 0 && (
                    <button
                      type="button"
                      onClick={() => void applyFilters({ offset: offset - limit })}
                      className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      Previous
                    </button>
                  )}
                  {offset + limit < total && (
                    <button
                      type="button"
                      onClick={() => void applyFilters({ offset: offset + limit })}
                      className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      Next
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
