import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { Building2, LogOut, Plus, UserCircle } from 'lucide-react'
import { getSessionServerFn } from '@/lib/auth'
import { logoutServerFn } from '@/server/auth'
import { listUserOrgsServerFn } from '@/server/org'

export const Route = createFileRoute('/_protected')({
  beforeLoad: async ({ location }) => {
    const session = await getSessionServerFn()
    if (!session) {
      throw redirect({
        to: '/login',
        search: { from: location.pathname, verified: false, reset: false },
      })
    }
    return { session }
  },
  loader: async () => {
    const result = await listUserOrgsServerFn()
    return {
      orgs: result.success ? result.orgs : [],
      atLimit: result.success ? result.atLimit : false,
    }
  },
  component: ProtectedLayout,
})

function ProtectedLayout() {
  const navigate = useNavigate()
  const { orgs, atLimit } = Route.useLoaderData()

  async function handleLogout() {
    await logoutServerFn()
    await navigate({
      to: '/login',
      search: { from: '/home', verified: false, reset: false },
    })
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-white">Scene Ready</span>
          {orgs.length > 0 && (
            <Link
              to="/home"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <Building2 className="w-4 h-4" />
              Organizations
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          {!atLimit && (
            <Link
              to="/create-org"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              New Organization
            </Link>
          )}
          <Link
            to="/profile"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <UserCircle className="w-4 h-4" />
            Profile
          </Link>
          <button
            onClick={() => void handleLogout()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
