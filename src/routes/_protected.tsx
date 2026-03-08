import { createFileRoute, Link, Outlet, redirect, useLocation, useMatches, useNavigate } from '@tanstack/react-router'
import { Fragment } from 'react'
import { Building2, Calendar, CalendarCheck, ClipboardList, GraduationCap, Home, LogOut, Shield, UserCircle, UserCog, Users, Layers } from 'lucide-react'
import { getSessionServerFn } from '@/lib/auth'
import { logoutServerFn } from '@/server/auth'
import { listUserOrgsServerFn } from '@/server/org'
import { canDo } from '@/lib/rbac'
import type { OrgView, OrgRole } from '@/lib/org.types'

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

type Crumb = { label: string; to?: string; params?: Record<string, string> }

function useBreadcrumbs(): Crumb[] {
  const { pathname } = useLocation()
  const matches = useMatches()
  const { orgs } = Route.useLoaderData()

  // Simple routes
  if (pathname === '/home') return [{ label: 'Home' }]
  if (pathname === '/profile') return [{ label: 'Profile' }]
  if (pathname === '/create-org') return [{ label: 'Create Organization' }]
  if (pathname === '/orgs') return [{ label: 'Organizations' }]
  if (pathname === '/admin') return [{ label: 'Admin Dashboard' }]
  if (pathname === '/admin/users') return [{ label: 'Admin Dashboard', to: '/admin' }, { label: 'Users' }]
  if (pathname === '/admin/orgs') return [{ label: 'Admin Dashboard', to: '/admin' }, { label: 'Organizations' }]

  // Org routes — extract slug from pathname, look up name from loader data
  const orgMatch = pathname.match(/^\/orgs\/([^/]+)/)
  if (orgMatch) {
    const slug = orgMatch[1]
    const org = orgs.find((o) => o.orgSlug === slug)
    const orgName = org?.orgName ?? slug
    const orgCrumb: Crumb = { label: 'Organizations', to: '/orgs' }
    const orgNameCrumb: Crumb = { label: orgName, to: '/orgs/$orgSlug', params: { orgSlug: slug } }
    const base = `/orgs/${slug}`

    if (pathname === base) return [orgCrumb, orgNameCrumb]
    if (pathname === `${base}/staff`) return [orgCrumb, orgNameCrumb, { label: 'Staff' }]
    if (pathname === `${base}/staff/audit`) return [orgCrumb, orgNameCrumb, { label: 'Staff', to: '/orgs/$orgSlug/staff', params: { orgSlug: slug } }, { label: 'Audit Log' }]
    if (pathname === `${base}/members`) return [orgCrumb, orgNameCrumb, { label: 'Members' }]
    if (pathname === `${base}/platoons`) return [orgCrumb, orgNameCrumb, { label: 'Platoons' }]
    if (pathname.startsWith(`${base}/platoons/`)) {
      return [orgCrumb, orgNameCrumb, { label: 'Platoons', to: '/orgs/$orgSlug/platoons', params: { orgSlug: slug } }, { label: 'Platoon' }]
    }
    if (pathname === `${base}/availability`) return [orgCrumb, orgNameCrumb, { label: 'Availability' }]
    if (pathname === `${base}/schedules`) return [orgCrumb, orgNameCrumb, { label: 'Schedules' }]
    if (pathname === `${base}/schedules/requirements`) {
      return [orgCrumb, orgNameCrumb, { label: 'Schedules', to: '/orgs/$orgSlug/schedules', params: { orgSlug: slug } }, { label: 'Requirements' }]
    }
    if (pathname.startsWith(`${base}/schedules/`)) {
      const scheduleMatch = matches.find((m) => (m.pathname as string | undefined)?.startsWith(`${base}/schedules/`))
      const loaderData = scheduleMatch?.loaderData as { schedule: { name: string } | null } | undefined
      const scheduleName = loaderData?.schedule?.name ?? 'Schedule'
      return [orgCrumb, orgNameCrumb, { label: 'Schedules', to: '/orgs/$orgSlug/schedules', params: { orgSlug: slug } }, { label: scheduleName }]
    }
    if (pathname === `${base}/qualifications`) return [orgCrumb, orgNameCrumb, { label: 'Qualifications' }]
    if (pathname.startsWith(`${base}/qualifications/positions/`)) {
      return [orgCrumb, orgNameCrumb, { label: 'Qualifications', to: '/orgs/$orgSlug/qualifications', params: { orgSlug: slug } }, { label: 'Eligibility' }]
    }
    if (pathname.startsWith(`${base}/staff/`)) {
      const staffMatch = matches.find((m) => (m.pathname as string | undefined)?.startsWith(`${base}/staff/`))
      const staffData = staffMatch?.loaderData as { staffMember: { name: string } | null } | undefined
      const staffName = staffData?.staffMember?.name ?? 'Staff Member'
      return [orgCrumb, orgNameCrumb, { label: 'Staff', to: '/orgs/$orgSlug/staff', params: { orgSlug: slug } }, { label: staffName }]
    }
  }

  return []
}

function Breadcrumbs() {
  const crumbs = useBreadcrumbs()

  if (crumbs.length === 0) {
    return <span className="text-sm font-medium text-navy-700">Scene Ready</span>
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <Fragment key={i}>
            {i > 0 && <span className="text-gray-300 select-none">/</span>}
            {!isLast && crumb.to ? (
              <Link
                to={crumb.to as never}
                params={crumb.params}
                className="text-gray-500 hover:text-navy-700 transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-navy-700' : 'text-gray-500'}>
                {crumb.label}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

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
  const { session } = Route.useRouteContext()
  const matches = useMatches()
  const orgMatch = matches.find((m) => m.routeId === '/_protected/orgs/$orgSlug')
  const orgCtx = orgMatch
    ? (orgMatch.context as unknown as { org: OrgView; userRole: OrgRole })
    : null

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
          <NavItem to="/home" icon={<Home className="w-5 h-5" />} label="Home" />
          <NavItem to="/orgs" icon={<Building2 className="w-5 h-5" />} label="Organizations" />

          {/* System admin nav */}
          {session.isSystemAdmin && (
            <>
              <div className="mt-4 mb-1 px-4">
                <span className="text-white/40 text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ fontFamily: 'var(--font-condensed)' }}>
                  <Shield className="w-3 h-3" /> System Admin
                </span>
              </div>
              <NavItem to="/admin" icon={<Shield className="w-5 h-5" />} label="Admin Dashboard" />
              <NavItem to="/admin/users" icon={<Users className="w-5 h-5" />} label="Users" />
              <NavItem to="/admin/orgs" icon={<Building2 className="w-5 h-5" />} label="Organizations" />
            </>
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
                to="/orgs/$orgSlug/schedules"
                params={{ orgSlug: orgCtx.org.slug }}
                icon={<Calendar className="w-5 h-5" />}
                label="Schedules"
              />
              <NavItem
                to="/orgs/$orgSlug/schedules/requirements"
                params={{ orgSlug: orgCtx.org.slug }}
                icon={<ClipboardList className="w-5 h-5" />}
                label="Requirements"
              />
              <NavItem
                to="/orgs/$orgSlug/availability"
                params={{ orgSlug: orgCtx.org.slug }}
                icon={<CalendarCheck className="w-5 h-5" />}
                label="Availability"
              />
              <NavItem
                to="/orgs/$orgSlug/staff"
                params={{ orgSlug: orgCtx.org.slug }}
                icon={<UserCog className="w-5 h-5" />}
                label="Staff"
              />
              <NavItem
                to="/orgs/$orgSlug/platoons"
                params={{ orgSlug: orgCtx.org.slug }}
                icon={<Layers className="w-5 h-5" />}
                label="Platoons"
              />
              {canDo(orgCtx.userRole, 'view-certifications') && (
                <NavItem
                  to="/orgs/$orgSlug/qualifications"
                  params={{ orgSlug: orgCtx.org.slug }}
                  icon={<GraduationCap className="w-5 h-5" />}
                  label="Qualifications"
                />
              )}
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
          <Breadcrumbs />
        </header>

        {/* Content */}
        <main className="flex-1 bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
