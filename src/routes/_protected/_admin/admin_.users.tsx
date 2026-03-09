import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Shield, ShieldOff, CheckCircle, XCircle } from 'lucide-react'
import { useState } from 'react'
import { listAllUsersServerFn, toggleSystemAdminServerFn } from '@/server/admin'

export const Route = createFileRoute('/_protected/_admin/admin_/users')({
  loader: async () => {
    const result = await listAllUsersServerFn({ data: {} })
    if (!result.success) throw new Error('Unauthorized')
    return result
  },
  head: () => ({ meta: [{ title: 'Users | Admin | Scene Ready' }] }),
  component: AdminUsers,
})

function AdminUsers() {
  const { users, total } = Route.useLoaderData()
  const router = useRouter()
  const [toggling, setToggling] = useState<string | null>(null)

  async function handleToggle(userId: string, enable: boolean) {
    setToggling(userId)
    const result = await toggleSystemAdminServerFn({ data: { userId, enable } })
    setToggling(null)
    if (result.success) {
      router.invalidate()
    } else if (result.error === 'LAST_ADMIN') {
      alert('Cannot remove the last system admin.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-red-700" />
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
            Users
          </h1>
        </div>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Verified</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Admin</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Orgs</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Created</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-navy-700">{user.email}</td>
                <td className="px-4 py-3 text-center">
                  {user.verified ? (
                    <CheckCircle className="w-4 h-4 text-green-600 inline-block" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-400 inline-block" />
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {user.isSystemAdmin && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{user.orgCount}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => void handleToggle(user.id, !user.isSystemAdmin)}
                    disabled={toggling === user.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-50
                      border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    {user.isSystemAdmin ? (
                      <><ShieldOff className="w-3.5 h-3.5" /> Revoke Admin</>
                    ) : (
                      <><Shield className="w-3.5 h-3.5" /> Grant Admin</>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
