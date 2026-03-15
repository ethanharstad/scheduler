import { createFileRoute, Link, Outlet, redirect, useRouteContext } from '@tanstack/react-router'
import { Award, Briefcase, ClipboardList, Settings, Star } from 'lucide-react'
import { canDo } from '@/lib/rbac'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/settings')({
  beforeLoad: async ({ context }) => {
    if (!canDo(context.userRole, 'edit-org-settings')) {
      throw redirect({ to: '/orgs/$orgSlug', params: { orgSlug: context.org.slug } })
    }
  },
  component: SettingsLayout,
})

function NavLink({
  to,
  params,
  icon,
  label,
  exact,
}: {
  to: string
  params: Record<string, string>
  icon: React.ReactNode
  label: string
  exact?: boolean
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      activeOptions={exact ? { exact: true } : undefined}
      className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-navy-700 hover:bg-gray-50 transition-colors [&.active]:bg-navy-50 [&.active]:text-navy-700"
    >
      {icon}
      {label}
    </Link>
  )
}

function SettingsLayout() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const slug = org.slug

  return (
    <div className="flex gap-8">
      {/* Left sub-nav */}
      <aside className="w-44 shrink-0">
        <p
          className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2"
          style={{ fontFamily: 'var(--font-condensed)' }}
        >
          Settings
        </p>
        <ul className="space-y-0.5">
          <li>
            <NavLink
              to="/orgs/$orgSlug/settings/"
              params={{ orgSlug: slug }}
              icon={<Settings className="w-4 h-4" />}
              label="General"
              exact
            />
          </li>
          <li>
            <NavLink
              to="/orgs/$orgSlug/settings/ranks"
              params={{ orgSlug: slug }}
              icon={<Star className="w-4 h-4" />}
              label="Ranks"
            />
          </li>
          <li>
            <NavLink
              to="/orgs/$orgSlug/settings/cert-types"
              params={{ orgSlug: slug }}
              icon={<Award className="w-4 h-4" />}
              label="Cert Types"
            />
          </li>
          <li>
            <NavLink
              to="/orgs/$orgSlug/settings/positions"
              params={{ orgSlug: slug }}
              icon={<Briefcase className="w-4 h-4" />}
              label="Positions"
            />
          </li>
          <li>
            <NavLink
              to="/orgs/$orgSlug/settings/scheduling"
              params={{ orgSlug: slug }}
              icon={<ClipboardList className="w-4 h-4" />}
              label="Scheduling"
            />
          </li>
        </ul>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
