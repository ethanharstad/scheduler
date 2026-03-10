import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { Package } from 'lucide-react'
import type { AssetView } from '@/lib/asset.types'
import { getMyGearServerFn } from '@/server/assets'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets/my-gear')({
  head: () => ({
    meta: [{ title: 'My Gear | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const result = await getMyGearServerFn({ data: { orgSlug: params.orgSlug } })
    if (!result.success) return { assets: [] }
    return { assets: result.assets }
  },
  component: MyGearPage,
})

const CATEGORY_LABELS: Record<string, string> = {
  scba: 'SCBA', ppe: 'PPE', radio: 'Radio', medical_equipment: 'Medical Equipment',
  tools: 'Tools', hose: 'Hose', nozzle: 'Nozzle', thermal_camera: 'Thermal Camera',
  gas_detector: 'Gas Detector', lighting: 'Lighting', extrication: 'Extrication',
  rope_rescue: 'Rope Rescue', water_rescue: 'Water Rescue', hazmat: 'HazMat', other: 'Other',
}

const GEAR_STATUS_LABELS: Record<string, string> = {
  available: 'Available', assigned: 'Assigned', out_of_service: 'Out of Service',
  decommissioned: 'Decommissioned', expired: 'Expired',
}

function statusBadge(status: string) {
  const label = GEAR_STATUS_LABELS[status] ?? status
  const cls =
    status === 'assigned' ? 'bg-blue-50 text-blue-700'
      : status === 'available' ? 'bg-success-bg text-success'
        : status === 'out_of_service' ? 'bg-warning-bg text-warning'
          : 'bg-gray-100 text-gray-500'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${cls}`}
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {label}
    </span>
  )
}

function expirationInfo(asset: AssetView) {
  if (!asset.expirationDate) return null
  const today = new Date()
  const exp = new Date(asset.expirationDate)
  const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return <span className="text-danger font-medium text-xs">Expired {Math.abs(daysLeft)}d ago</span>
  if (daysLeft <= 30) return <span className="text-warning font-medium text-xs">Expires in {daysLeft}d</span>
  return <span className="text-gray-500 text-xs">{asset.expirationDate}</span>
}

function MyGearPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { assets } = Route.useLoaderData()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/orgs/$orgSlug/assets" params={{ orgSlug: org.slug }} className="hover:text-navy-700 transition-colors">
              Assets
            </Link>
            <span>/</span>
            <span>My Gear</span>
          </div>
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-sans)' }}>
            My Gear
          </h1>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {assets.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No gear assigned to you.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Serial</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Expiration</th>
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
                  </td>
                  <td className="px-4 py-3 text-gray-600">{CATEGORY_LABELS[a.category] ?? a.category}</td>
                  <td className="px-4 py-3">{statusBadge(a.status)}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{a.serialNumber ?? '—'}</td>
                  <td className="px-4 py-3">{expirationInfo(a) ?? <span className="text-gray-400 text-xs">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
