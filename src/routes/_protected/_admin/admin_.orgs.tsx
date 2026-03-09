import { createFileRoute, Link } from '@tanstack/react-router'
import { Building2, Shield } from 'lucide-react'
import { listAllOrgsServerFn } from '@/server/admin'

export const Route = createFileRoute('/_protected/_admin/admin_/orgs')({
  loader: async () => {
    const result = await listAllOrgsServerFn({ data: {} })
    if (!result.success) throw new Error('Unauthorized')
    return result
  },
  head: () => ({ meta: [{ title: 'Organizations | Admin | Scene Ready' }] }),
  component: AdminOrgs,
})

function AdminOrgs() {
  const { orgs, total } = Route.useLoaderData()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-red-700" />
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
            Organizations
          </h1>
        </div>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Slug</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Plan</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Members</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Created</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    to="/orgs/$orgSlug"
                    params={{ orgSlug: org.slug }}
                    className="font-medium text-navy-700 hover:underline flex items-center gap-2"
                  >
                    <Building2 className="w-4 h-4 text-gray-400" />
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{org.slug}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 capitalize">
                    {org.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                    org.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {org.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{org.memberCount}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(org.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
