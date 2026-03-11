import { createFileRoute, Link, Outlet, redirect, useLocation, useMatches, useNavigate } from '@tanstack/react-router'
import { Fragment, useState, useEffect, useRef } from 'react'
import { Building2, Calendar, CalendarCheck, Check, ChevronsUpDown, ClipboardList, GraduationCap, LayoutDashboard, LogOut, Settings, Shield, Truck, UserCircle, UserCog, Users } from 'lucide-react'
import { getSessionServerFn } from '@/lib/auth'
import { logoutServerFn } from '@/server/auth'
import { listUserOrgsServerFn } from '@/server/org'
import { canDo } from '@/lib/rbac'
import { SelectedOrgProvider, useSelectedOrg } from '@/lib/org-context'
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
  component: ProtectedLayoutRoot,
})

type Crumb = { label: string; to?: string; params?: Record<string, string> }

function useBreadcrumbs(): Crumb[] {
  const { pathname } = useLocation()
  const matches = useMatches()

  // Simple routes
  if (pathname === '/profile') return [{ label: 'Profile' }]
  if (pathname === '/create-org') return [{ label: 'Create Organization' }]
  if (pathname === '/orgs') return [{ label: 'Organizations' }]
  if (pathname === '/admin') return [{ label: 'Admin Dashboard' }]
  if (pathname === '/admin/users') return [{ label: 'Admin Dashboard', to: '/admin' }, { label: 'Users' }]
  if (pathname === '/admin/orgs') return [{ label: 'Admin Dashboard', to: '/admin' }, { label: 'Organizations' }]

  // Org routes
  const orgMatch = pathname.match(/^\/orgs\/([^/]+)/)
  if (orgMatch) {
    const slug = orgMatch[1]
    const base = `/orgs/${slug}`

    if (pathname === base) return [{ label: 'Dashboard' }]
    if (pathname === `${base}/staff`) return [{ label: 'Staff' }]
    if (pathname === `${base}/staff/audit`) return [{ label: 'Staff', to: '/orgs/$orgSlug/staff', params: { orgSlug: slug } }, { label: 'Audit Log' }]
    if (pathname === `${base}/members`) return [{ label: 'Members' }]
    if (pathname === `${base}/settings`) return [{ label: 'Settings' }]
    if (pathname === `${base}/availability`) return [{ label: 'Availability' }]
    if (pathname === `${base}/schedules`) return [{ label: 'Schedules' }]
    if (pathname === `${base}/schedules/requirements`) {
      return [{ label: 'Schedules', to: '/orgs/$orgSlug/schedules', params: { orgSlug: slug } }, { label: 'Requirements' }]
    }
    if (pathname === `${base}/schedules/platoons`) {
      return [{ label: 'Schedules', to: '/orgs/$orgSlug/schedules', params: { orgSlug: slug } }, { label: 'Platoons' }]
    }
    if (pathname.startsWith(`${base}/schedules/platoons/`)) {
      return [{ label: 'Schedules', to: '/orgs/$orgSlug/schedules', params: { orgSlug: slug } }, { label: 'Platoons', to: '/orgs/$orgSlug/schedules/platoons', params: { orgSlug: slug } }, { label: 'Platoon' }]
    }
    if (pathname.startsWith(`${base}/schedules/`)) {
      const scheduleMatch = matches.find((m) => (m.pathname as string | undefined)?.startsWith(`${base}/schedules/`))
      const loaderData = scheduleMatch?.loaderData as { schedule: { name: string } | null } | undefined
      const scheduleName = loaderData?.schedule?.name ?? 'Schedule'
      return [{ label: 'Schedules', to: '/orgs/$orgSlug/schedules', params: { orgSlug: slug } }, { label: scheduleName }]
    }
    if (pathname === `${base}/qualifications`) return [{ label: 'Qualifications' }]
    if (pathname.startsWith(`${base}/qualifications/positions/`)) {
      return [{ label: 'Qualifications', to: '/orgs/$orgSlug/qualifications', params: { orgSlug: slug } }, { label: 'Eligibility' }]
    }
    if (pathname === `${base}/assets`) return [{ label: 'Assets' }]
    if (pathname === `${base}/assets/new`) return [{ label: 'Assets', to: '/orgs/$orgSlug/assets', params: { orgSlug: slug } }, { label: 'New Asset' }]
    if (pathname === `${base}/assets/my-gear`) return [{ label: 'Assets', to: '/orgs/$orgSlug/assets', params: { orgSlug: slug } }, { label: 'My Gear' }]
    if (pathname.startsWith(`${base}/assets/`)) return [{ label: 'Assets', to: '/orgs/$orgSlug/assets', params: { orgSlug: slug } }, { label: 'Asset Detail' }]
    if (pathname === `${base}/forms`) return [{ label: 'Forms' }]
    if (pathname === `${base}/forms/templates/new`) return [{ label: 'Forms', to: '/orgs/$orgSlug/forms', params: { orgSlug: slug } }, { label: 'New Template' }]
    if (pathname.startsWith(`${base}/forms/templates/`)) return [{ label: 'Forms', to: '/orgs/$orgSlug/forms', params: { orgSlug: slug } }, { label: 'Template' }]
    if (pathname.startsWith(`${base}/forms/fill/`)) return [{ label: 'Forms', to: '/orgs/$orgSlug/forms', params: { orgSlug: slug } }, { label: 'Fill Form' }]
    if (pathname === `${base}/forms/submissions`) return [{ label: 'Forms', to: '/orgs/$orgSlug/forms', params: { orgSlug: slug } }, { label: 'Submissions' }]
    if (pathname.startsWith(`${base}/forms/submissions/`)) return [{ label: 'Forms', to: '/orgs/$orgSlug/forms', params: { orgSlug: slug } }, { label: 'Submission' }]
    if (pathname.startsWith(`${base}/staff/`)) {
      const staffMatch = matches.find((m) => (m.pathname as string | undefined)?.startsWith(`${base}/staff/`))
      const staffData = staffMatch?.loaderData as { staffMember: { name: string } | null } | undefined
      const staffName = staffData?.staffMember?.name ?? 'Staff Member'
      return [{ label: 'Staff', to: '/orgs/$orgSlug/staff', params: { orgSlug: slug } }, { label: staffName }]
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
                params={crumb.params as never}
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
  exact,
}: {
  to: string
  params?: Record<string, string>
  icon: React.ReactNode
  label: string
  exact?: boolean
}) {
  return (
    <Link
      to={to}
      params={params}
      activeOptions={exact ? { exact: true } : undefined}
      className="flex items-center gap-3 h-11 px-4 rounded-none text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors [&.active]:border-l-[3px] [&.active]:border-red-700 [&.active]:bg-white/10 [&.active]:text-white [&.active]:pl-[13px]"
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">{icon}</span>
      {label}
    </Link>
  )
}

const roleLabels: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  payroll_hr: 'Payroll/HR',
}

function OrgSwitcher({ orgCtx }: { orgCtx: { org: OrgView; userRole: OrgRole } | null }) {
  const [open, setOpen] = useState(false)
  const { orgs, atLimit } = Route.useLoaderData()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const currentSlug = orgCtx?.org.slug ?? null

  return (
    <div ref={ref} className="relative px-2 py-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 h-11 px-3 w-full rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      >
        <span className="w-5 h-5 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5" />
        </span>
        <span className="flex-1 text-left truncate">
          {orgCtx ? orgCtx.org.name : 'Organizations'}
        </span>
        <ChevronsUpDown className="w-4 h-4 text-white/50 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-[#0f1e35] border border-white/10 rounded-lg shadow-xl z-50 py-1">
          {orgs.map((o) => {
            const isCurrent = o.orgSlug === currentSlug
            return (
              <button
                key={o.orgSlug}
                onClick={() => {
                  setOpen(false)
                  void navigate({ to: '/orgs/$orgSlug', params: { orgSlug: o.orgSlug } })
                }}
                className="flex items-center gap-3 w-full px-3 h-10 text-sm text-left hover:bg-white/10 transition-colors"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {isCurrent && <Check className="w-4 h-4 text-red-400" />}
                </span>
                <span className="flex-1 truncate text-white">{o.orgName}</span>
                <span className="text-white/40 text-xs shrink-0">{roleLabels[o.role]}</span>
              </button>
            )
          })}
          <div className="border-t border-white/10 my-1" />
          {!atLimit && (
            <button
              onClick={() => {
                setOpen(false)
                void navigate({ to: '/create-org' })
              }}
              className="flex items-center gap-3 w-full px-4 h-9 text-xs text-white/50 hover:text-white transition-colors"
            >
              + Create Organization
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false)
              void navigate({ to: '/orgs' })
            }}
            className="flex items-center gap-3 w-full px-4 h-9 text-xs text-white/50 hover:text-white transition-colors"
          >
            All Organizations →
          </button>
        </div>
      )}
    </div>
  )
}

function ProtectedLayoutRoot() {
  return (
    <SelectedOrgProvider>
      <ProtectedLayout />
    </SelectedOrgProvider>
  )
}

function ProtectedLayout() {
  const navigate = useNavigate()
  const { session } = Route.useRouteContext()
  const { selectedOrg, setSelectedOrg } = useSelectedOrg()
  const matches = useMatches()
  const orgMatch = matches.find((m) => m.routeId === '/_protected/orgs/$orgSlug')
  const orgCtx = orgMatch
    ? (orgMatch.context as unknown as { org: OrgView; userRole: OrgRole })
    : null

  useEffect(() => {
    if (orgCtx) setSelectedOrg(orgCtx)
  }, [orgCtx, setSelectedOrg])

  const effectiveOrgCtx = orgCtx ?? selectedOrg

  async function handleLogout() {
    await logoutServerFn()
    await navigate({
      to: '/login',
      search: { from: '/orgs', verified: false, reset: false },
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
          <OrgSwitcher orgCtx={effectiveOrgCtx} />

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
          {effectiveOrgCtx && (
            <>
              <div className="border-t border-white/10 my-1" />
              <NavItem
                to="/orgs/$orgSlug"
                params={{ orgSlug: effectiveOrgCtx.org.slug }}
                icon={<LayoutDashboard className="w-5 h-5" />}
                label="Dashboard"
                exact
              />

              {/* Scheduling */}
              <div className="mt-4 mb-1 px-4">
                <span className="text-white/40 text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Scheduling
                </span>
              </div>
              <NavItem
                to="/orgs/$orgSlug/schedules"
                params={{ orgSlug: effectiveOrgCtx.org.slug }}
                icon={<Calendar className="w-5 h-5" />}
                label="Schedules"
              />
              <NavItem
                to="/orgs/$orgSlug/availability"
                params={{ orgSlug: effectiveOrgCtx.org.slug }}
                icon={<CalendarCheck className="w-5 h-5" />}
                label="Availability"
              />

              {/* Personnel */}
              <div className="mt-4 mb-1 px-4">
                <span className="text-white/40 text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Personnel
                </span>
              </div>
              <NavItem
                to="/orgs/$orgSlug/staff"
                params={{ orgSlug: effectiveOrgCtx.org.slug }}
                icon={<UserCog className="w-5 h-5" />}
                label="Staff"
              />
              {canDo(effectiveOrgCtx.userRole, 'view-certifications') && (
                <NavItem
                  to="/orgs/$orgSlug/qualifications"
                  params={{ orgSlug: effectiveOrgCtx.org.slug }}
                  icon={<GraduationCap className="w-5 h-5" />}
                  label="Qualifications"
                />
              )}

              {/* Assets */}
              <div className="mt-4 mb-1 px-4">
                <span className="text-white/40 text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Assets
                </span>
              </div>
              <NavItem
                to="/orgs/$orgSlug/assets"
                params={{ orgSlug: effectiveOrgCtx.org.slug }}
                icon={<Truck className="w-5 h-5" />}
                label="Assets"
              />
              {(canDo(effectiveOrgCtx.userRole, 'manage-forms') || canDo(effectiveOrgCtx.userRole, 'submit-forms')) && (
                <NavItem
                  to="/orgs/$orgSlug/forms"
                  params={{ orgSlug: effectiveOrgCtx.org.slug }}
                  icon={<ClipboardList className="w-5 h-5" />}
                  label="Forms"
                />
              )}

              {/* Administration */}
              {(canDo(effectiveOrgCtx.userRole, 'assign-roles') || canDo(effectiveOrgCtx.userRole, 'edit-org-settings')) && (
                <>
                  <div className="mt-4 mb-1 px-4">
                    <span className="text-white/40 text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>
                      Administration
                    </span>
                  </div>
                  {canDo(effectiveOrgCtx.userRole, 'assign-roles') && (
                    <NavItem
                      to="/orgs/$orgSlug/members"
                      params={{ orgSlug: effectiveOrgCtx.org.slug }}
                      icon={<Users className="w-5 h-5" />}
                      label="Members"
                    />
                  )}
                  {canDo(effectiveOrgCtx.userRole, 'edit-org-settings') && (
                    <NavItem
                      to="/orgs/$orgSlug/settings"
                      params={{ orgSlug: effectiveOrgCtx.org.slug }}
                      icon={<Settings className="w-5 h-5" />}
                      label="Settings"
                    />
                  )}
                </>
              )}
            </>
          )}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-white/10 py-2 shrink-0">
          <NavItem to="/profile" icon={<UserCircle className="w-5 h-5" />} label={session.displayName} />
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
