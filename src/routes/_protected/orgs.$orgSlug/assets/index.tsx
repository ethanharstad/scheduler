import { useState, useRef } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import {
  listAssetsServerFn,
  getExpiringAssetsServerFn,
  getOverdueInspectionsServerFn,
} from '@/server/assets'
import type { AssetView } from '@/lib/asset.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets/')({
  head: () => ({ meta: [{ title: 'Assets | Scene Ready' }] }),
  loader: async ({ params }) => {
    const [assetsResult, expiringResult, overdueResult] = await Promise.all([
      listAssetsServerFn({ data: { orgSlug: params.orgSlug } }),
      getExpiringAssetsServerFn({ data: { orgSlug: params.orgSlug } }),
      getOverdueInspectionsServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      assets: assetsResult.success ? assetsResult.assets : [],
      total: assetsResult.success ? assetsResult.total : 0,
      expiringAssets: expiringResult.success ? expiringResult.assets : [],
      overdueInspections: overdueResult.success ? overdueResult.overdueInspections : [],
    }
  },
  component: AssetsIndex,
})

const TYPE_LABELS: Record<string, string> = {
  apparatus: 'Apparatus',
  gear: 'Gear',
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

const STATUS_LABELS: Record<string, string> = {
  in_service: 'In Service',
  out_of_service: 'Out of Service',
  reserve: 'Reserve',
  decommissioned: 'Decommissioned',
  available: 'Available',
  assigned: 'Assigned',
  expired: 'Expired',
}

function statusBadge(status: string) {
  const label = STATUS_LABELS[status] ?? status
  if (status === 'in_service' || status === 'available') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-success-bg text-success" style={{ fontFamily: 'var(--font-condensed)' }}>
        {label}
      </span>
    )
  }
  if (status === 'decommissioned' || status === 'expired') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>
        {label}
      </span>
    )
  }
  if (status === 'out_of_service') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-danger-bg text-danger" style={{ fontFamily: 'var(--font-condensed)' }}>
        {label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-warning-bg text-warning" style={{ fontFamily: 'var(--font-condensed)' }}>
      {label}
    </span>
  )
}

function orgToday(scheduleDayStart: string): string {
  const now = new Date()
  const [h, m] = scheduleDayStart.split(':').map(Number)
  const dayStartMs = ((h ?? 0) * 60 + (m ?? 0)) * 60 * 1000
  const utcMs = now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000
  const effectiveDate = utcMs < dayStartMs ? new Date(now.getTime() - 86400000) : now
  return effectiveDate.toISOString().slice(0, 10)
}

function daysUntil(dateStr: string, scheduleDayStart: string): number {
  const today = orgToday(scheduleDayStart)
  const todayMs = new Date(today + 'T00:00:00Z').getTime()
  const targetMs = new Date(dateStr + 'T00:00:00Z').getTime()
  return Math.ceil((targetMs - todayMs) / (1000 * 60 * 60 * 24))
}

function AssetsIndex() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { assets: initialAssets, total: initialTotal, expiringAssets, overdueInspections } = Route.useLoaderData()

  const [assets, setAssets] = useState<AssetView[]>(initialAssets)
  const [total, setTotal] = useState(initialTotal)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [alertsExpanded, setAlertsExpanded] = useState(true)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const LIMIT = 50

  async function applyFilters(overrides: {
    type?: string; status?: string; category?: string; search?: string; offset?: number
  } = {}) {
    const resolvedType = overrides.type !== undefined ? overrides.type : typeFilter
    const resolvedStatus = overrides.status !== undefined ? overrides.status : statusFilter
    const resolvedCategory = overrides.category !== undefined ? overrides.category : categoryFilter
    const resolvedSearch = overrides.search !== undefined ? overrides.search : search
    const resolvedOffset = overrides.offset !== undefined ? overrides.offset : offset

    setLoading(true)
    const result = await listAssetsServerFn({
      data: {
        orgSlug: org.slug,
        assetType: resolvedType !== 'all' ? (resolvedType as 'apparatus' | 'gear') : undefined,
        status: resolvedStatus || undefined,
        category: resolvedCategory || undefined,
        search: resolvedSearch || undefined,
        limit: LIMIT,
        offset: resolvedOffset,
      },
    })
    setLoading(false)
    if (result.success) {
      setAssets(result.assets)
      setTotal(result.total)
    }
  }

  async function handleTypeChange(type: string) {
    setTypeFilter(type)
    setOffset(0)
    setStatusFilter('')
    setCategoryFilter('')
    await applyFilters({ type, status: '', category: '', offset: 0 })
  }

  function handleSearchInput(val: string) {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setOffset(0)
      void applyFilters({ search: val, offset: 0 })
    }, 300)
  }

  const hasAlerts = expiringAssets.length > 0 || overdueInspections.length > 0

  return (
    <div className="space-y-6">
      {/* Alerts section */}
      {hasAlerts && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setAlertsExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger" />
              <span className="font-semibold text-gray-900">
                Compliance Alerts
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-danger text-white text-xs font-bold">
                  {expiringAssets.length + overdueInspections.length}
                </span>
              </span>
            </div>
            {alertsExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>

          {alertsExpanded && (
            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {overdueInspections.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="w-3.5 h-3.5 text-danger" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-danger" style={{ fontFamily: 'var(--font-condensed)' }}>
                      Inspection Alerts ({overdueInspections.length})
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {overdueInspections.slice(0, 5).map((item) => {
                      const days = item.schedule.nextInspectionDue ? daysUntil(item.schedule.nextInspectionDue, org.scheduleDayStart) : 0
                      return (
                        <li key={item.schedule.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-200 last:border-0">
                          <Link
                            to="/orgs/$orgSlug/assets/$assetId"
                            params={{ orgSlug: org.slug, assetId: item.assetId }}
                            className="text-navy-700 hover:underline font-medium"
                          >
                            {item.assetName} — {item.schedule.label}
                          </Link>
                          <span className={`text-xs font-semibold ${days < 0 ? 'text-danger' : 'text-warning'}`}>
                            {days < 0 ? `${Math.abs(days)}d overdue` : `Due in ${days}d`}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {expiringAssets.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-warning" style={{ fontFamily: 'var(--font-condensed)' }}>
                      Expiring Soon ({expiringAssets.length})
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {expiringAssets.slice(0, 5).map((a) => {
                      const days = a.expirationDate ? daysUntil(a.expirationDate, org.scheduleDayStart) : 0
                      return (
                        <li key={a.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-200 last:border-0">
                          <Link
                            to="/orgs/$orgSlug/assets/$assetId"
                            params={{ orgSlug: org.slug, assetId: a.id }}
                            className="text-navy-700 hover:underline font-medium"
                          >
                            {a.name}
                          </Link>
                          <span className={`text-xs font-semibold ${days < 0 ? 'text-danger' : 'text-warning'}`}>
                            {days < 0 ? `Expired ${Math.abs(days)}d ago` : `Expires in ${days}d`}
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
      )}

      {/* Filters + table in single card */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Type tabs */}
        <div className="flex gap-1 border-b border-gray-200 px-4">
          {(['all', 'apparatus', 'gear'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                typeFilter === t
                  ? 'border-red-700 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-navy-700'
              }`}
            >
              {t === 'all' ? 'All' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Filter toolbar */}
        <div className="flex flex-wrap gap-3 items-center px-4 py-3 border-b border-gray-200">
          <select
            value={statusFilter}
            onChange={async (e) => {
              setStatusFilter(e.target.value)
              setOffset(0)
              await applyFilters({ status: e.target.value, offset: 0 })
            }}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-navy-700"
          >
            <option value="">All statuses</option>
            {typeFilter === 'all' && (
              <>
                <option value="in_service">In Service</option>
                <option value="available">Available</option>
                <option value="assigned">Assigned</option>
                <option value="out_of_service">Out of Service</option>
                <option value="reserve">Reserve</option>
                <option value="decommissioned">Decommissioned</option>
                <option value="expired">Expired</option>
              </>
            )}
            {typeFilter === 'apparatus' && (
              <>
                <option value="in_service">In Service</option>
                <option value="out_of_service">Out of Service</option>
                <option value="reserve">Reserve</option>
                <option value="decommissioned">Decommissioned</option>
              </>
            )}
            {typeFilter === 'gear' && (
              <>
                <option value="available">Available</option>
                <option value="assigned">Assigned</option>
                <option value="out_of_service">Out of Service</option>
                <option value="decommissioned">Decommissioned</option>
                <option value="expired">Expired</option>
              </>
            )}
          </select>

          <input
            type="search"
            placeholder="Search name, unit #, serial #…"
            value={search}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="flex-1 min-w-48 text-sm border border-gray-300 rounded-md px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-navy-700"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-700" />
          </div>
        ) : assets.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-gray-700">No assets found</p>
            <p className="text-xs text-gray-400 mt-1">Adjust your filters or add a new asset.</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                  {typeFilter === 'all' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Type</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>ID / Serial</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assets.map((asset) => {
                  const expDays = asset.expirationDate ? daysUntil(asset.expirationDate, org.scheduleDayStart) : null
                  return (
                    <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to="/orgs/$orgSlug/assets/$assetId"
                          params={{ orgSlug: org.slug, assetId: asset.id }}
                          className="font-medium text-navy-700 hover:underline"
                        >
                          {asset.name}
                        </Link>
                        {asset.assignedToStaffName && (
                          <div className="text-xs text-gray-400">→ {asset.assignedToStaffName}</div>
                        )}
                        {asset.assignedToApparatusName && (
                          <div className="text-xs text-gray-400">→ {asset.assignedToApparatusName}</div>
                        )}
                      </td>
                      {typeFilter === 'all' && (
                        <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[asset.assetType] ?? asset.assetType}</td>
                      )}
                      <td className="px-4 py-3 text-gray-600">{CATEGORY_LABELS[asset.category] ?? asset.category}</td>
                      <td className="px-4 py-3">{statusBadge(asset.status)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                        {asset.unitNumber && <div>{asset.unitNumber}</div>}
                        {asset.serialNumber && <div>{asset.serialNumber}</div>}
                        {!asset.unitNumber && !asset.serialNumber && <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {asset.expirationDate ? (
                          <span className={`text-xs font-semibold ${expDays !== null && expDays < 0 ? 'text-danger' : expDays !== null && expDays <= 30 ? 'text-warning' : 'text-gray-600'}`}>
                            {asset.expirationDate}
                            {expDays !== null && expDays < 0 && <span className="block text-danger">Expired</span>}
                            {expDays !== null && expDays >= 0 && expDays <= 30 && <span className="block text-warning">Soon</span>}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <span className="text-sm text-gray-500">
                  Showing {offset + 1}–{Math.min(offset + assets.length, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={offset === 0}
                    onClick={async () => {
                      const newOffset = Math.max(0, offset - LIMIT)
                      setOffset(newOffset)
                      await applyFilters({ offset: newOffset })
                    }}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-100"
                  >
                    Previous
                  </button>
                  <button
                    disabled={offset + assets.length >= total}
                    onClick={async () => {
                      const newOffset = offset + LIMIT
                      setOffset(newOffset)
                      await applyFilters({ offset: newOffset })
                    }}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
