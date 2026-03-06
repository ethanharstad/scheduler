import { createFileRoute, Link } from '@tanstack/react-router'
import { Building2, Shield, Users } from 'lucide-react'
import { getAdminStatsServerFn } from '@/server/admin'

export const Route = createFileRoute('/_protected/_admin/admin')({
  loader: async () => {
    const result = await getAdminStatsServerFn()
    if (!result.success) throw new Error('Unauthorized')
    return result.stats
  },
  head: () => ({ meta: [{ title: 'Admin Dashboard | Scene Ready' }] }),
  component: AdminDashboard,
})

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-navy-700">{icon}</span>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-3xl font-bold text-navy-700">{value.toLocaleString()}</div>
    </div>
  )
}

function AdminDashboard() {
  const stats = Route.useLoaderData()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-red-700" />
        <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
          Admin Dashboard
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Users" value={stats.totalUsers} icon={<Users className="w-5 h-5" />} />
        <StatCard label="Total Organizations" value={stats.totalOrgs} icon={<Building2 className="w-5 h-5" />} />
        <StatCard label="Active Sessions" value={stats.activeSessions} icon={<Shield className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/admin/users"
          className="bg-white rounded-lg border border-gray-200 p-6 hover:border-navy-700 transition-colors"
        >
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-navy-700" />
            <span className="font-semibold text-navy-700">Manage Users</span>
          </div>
          <p className="text-sm text-gray-500">View all platform users, grant or revoke admin access</p>
        </Link>
        <Link
          to="/admin/orgs"
          className="bg-white rounded-lg border border-gray-200 p-6 hover:border-navy-700 transition-colors"
        >
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-navy-700" />
            <span className="font-semibold text-navy-700">Manage Organizations</span>
          </div>
          <p className="text-sm text-gray-500">View all organizations, access any org workspace</p>
        </Link>
      </div>
    </div>
  )
}
