import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { getMyGearServerFn } from '@/server/assets'
import type { AssetView } from '@/lib/asset.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets/my-gear')({
  head: () => ({ meta: [{ title: 'My Gear | Scene Ready' }] }),
  loader: async ({ params }) => {
    const result = await getMyGearServerFn({ data: { orgSlug: params.orgSlug } })
    if (!result.success) return { assets: [], noStaffRecord: result.error === 'NO_STAFF_RECORD' }
    return { assets: result.assets, noStaffRecord: false }
  },
  component: MyGearPage,
})

const CATEGORY_LABELS: Record<string, string> = {
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
  available: 'Available',
  assigned: 'Assigned',
  out_of_service: 'Out of Service',
  decommissioned: 'Decommissioned',
  expired: 'Expired',
}

function statusBadge(status: string) {
  const label = STATUS_LABELS[status] ?? status
  const base = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide'
  if (status === 'available' || status === 'assigned') {
    return (
      <span className={`${base} bg-success-bg text-success`} style={{ fontFamily: 'var(--font-condensed)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
        {label}
      </span>
    )
  }
  if (status === 'out_of_service' || status === 'expired') {
    return (
      <span className={`${base} bg-danger-bg text-danger`} style={{ fontFamily: 'var(--font-condensed)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
        {label}
      </span>
    )
  }
  return (
    <span className={`${base} bg-gray-100 text-gray-500`} style={{ fontFamily: 'var(--font-condensed)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
      {label}
    </span>
  )
}

function MyGearPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { assets, noStaffRecord } = Route.useLoaderData()

  if (noStaffRecord) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg py-16 text-center">
        <p className="text-gray-500 text-sm">You don't have a staff record in this organization.</p>
        <p className="text-gray-400 text-xs mt-1">Contact an admin to be added to the staff roster.</p>
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg py-16 text-center">
        <p className="text-gray-500 text-sm">No gear assigned to you.</p>
        <p className="text-gray-400 text-xs mt-1">Contact your manager to have gear assigned to you.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Category</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Serial #</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Expires</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {(assets as AssetView[]).map((asset) => (
            <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  to="/orgs/$orgSlug/assets/$assetId"
                  params={{ orgSlug: org.slug, assetId: asset.id }}
                  className="font-medium text-navy-700 hover:underline"
                >
                  {asset.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600">{CATEGORY_LABELS[asset.category] ?? asset.category}</td>
              <td className="px-4 py-3">{statusBadge(asset.status)}</td>
              <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                {asset.serialNumber ?? <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {asset.expirationDate ?? <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
