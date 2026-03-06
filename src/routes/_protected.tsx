import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { Building2, LogOut, Plus, UserCircle, UserCog, Users } from 'lucide-react'
import { getSessionServerFn } from '@/lib/auth'
import { logoutServerFn } from '@/server/auth'
import { listUserOrgsServerFn } from '@/server/org'
import { useOrgContext } from '@/lib/org-context'
import { canDo } from '@/lib/rbac'

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

function NavItem({
  to,
  params,
  icon,
  label,
}: {
  to: string
  params?: Record<string, string>
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      to={to}
      params={params}
      className="flex items-center gap-3 h-11 px-4 rounded-none text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors [&.active]:border-l-[3px] [&.active]:border-red-700 [&.active]:bg-white/10 [&.active]:text-white [&.active]:pl-[13px]"
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">{icon}</span>
      {label}
    </Link>
  )
}

function ProtectedLayout() {
  const navigate = useNavigate()
  const { atLimit } = Route.useLoaderData()
  const orgCtx = useOrgContext()

  async function handleLogout() {
    await logoutServerFn()
    await navigate({
      to: '/login',
      search: { from: '/home', verified: false, reset: false },
    })
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-full w-64 bg-navy-700 flex flex-col z-30">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10 shrink-0">
          <svg viewBox="0 0 100 100" className="w-7 h-7 shrink-0" aria-hidden="true">
            <path d="M 50 10 L 85 40 L 85 55 L 50 25 L 15 55 L 15 40 Z" fill="#FFFFFF"/>
            <path d="M 50 35 L 85 65 L 85 80 L 50 50 L 15 80 L 15 65 Z" fill="#C8102E"/>
          </svg>
          <div>
            <div className="text-white font-bold text-lg leading-tight" style={{ fontFamily: 'var(--font-sans)' }}>
              Scene Ready
            </div>
            <div className="text-white/50 text-xs leading-tight">Prepared to Perform</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {/* Global nav */}
          <NavItem to="/home" icon={<Building2 className="w-5 h-5" />} label="Home" />
          {!atLimit && (
            <NavItem to="/create-org" icon={<Plus className="w-5 h-5" />} label="New Organization" />
          )}

          {/* Org-specific nav */}
          {orgCtx && (
            <>
              <div className="mt-4 mb-1 px-4">
                <span className="text-white/40 text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>
                  {orgCtx.org.name}
                </span>
              </div>
              <NavItem
                to="/orgs/$orgSlug/staff"
                params={{ orgSlug: orgCtx.org.slug }}
                icon={<UserCog className="w-5 h-5" />}
                label="Staff"
              />
              {canDo(orgCtx.userRole, 'assign-roles') && (
                <NavItem
                  to="/orgs/$orgSlug/members"
                  params={{ orgSlug: orgCtx.org.slug }}
                  icon={<Users className="w-5 h-5" />}
                  label="Members"
                />
              )}
            </>
          )}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-white/10 py-2 shrink-0">
          <NavItem to="/profile" icon={<UserCircle className="w-5 h-5" />} label="Profile" />
          <button
            onClick={() => void handleLogout()}
            className="flex items-center gap-3 h-11 px-4 w-full text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="w-5 h-5 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5" />
            </span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="ml-64 flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
          {orgCtx ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Link to="/home" className="hover:text-navy-700 transition-colors">Home</Link>
              <span className="text-gray-300">/</span>
              <Link
                to="/orgs/$orgSlug"
                params={{ orgSlug: orgCtx.org.slug }}
                className="hover:text-navy-700 transition-colors font-medium text-navy-700"
              >
                {orgCtx.org.name}
              </Link>
            </div>
          ) : (
            <span className="text-sm font-medium text-navy-700">Scene Ready</span>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
