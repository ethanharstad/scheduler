import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouteContext,
} from '@tanstack/react-router'
import { ChevronDown, Users, UserCog } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import { getOrgServerFn } from '@/server/org'

export const Route = createFileRoute('/_protected/orgs/$orgSlug')({
  beforeLoad: async ({ params }) => {
    const result = await getOrgServerFn({ data: { slug: params.orgSlug } })
    if (!result.success) {
      throw redirect({ to: '/home' })
    }
    return { org: result.org, userRole: result.userRole }
  },
  component: OrgLayout,
})

function OrgLayout() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-4">
          <Link
            to="/home"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <span className="text-gray-600">←</span>
            All Organizations
          </Link>
          <Link
            to="/orgs/$orgSlug/staff"
            params={{ orgSlug: org.slug }}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <UserCog className="w-4 h-4" />
            Staff
          </Link>
          {canDo(userRole, 'assign-roles') && (
            <Link
              to="/orgs/$orgSlug/members"
              params={{ orgSlug: org.slug }}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <Users className="w-4 h-4" />
              Members
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm font-medium cursor-default">
            <span>{org.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-500 ml-1" />
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  )
}
