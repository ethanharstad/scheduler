import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { getSessionServerFn } from '@/lib/auth'
import { logoutServerFn } from '@/server/auth'

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
  component: ProtectedLayout,
})

function ProtectedLayout() {
  const navigate = useNavigate()

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
        <span className="font-semibold text-white">Scheduler</span>
        <button
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </header>
      <Outlet />
    </div>
  )
}
