import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { useRouteContext } from '@tanstack/react-router'
import { canDo } from '@/lib/rbac'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/trades')({
  component: TradesLayout,
})

function TradesLayout() {
  const { orgSlug } = Route.useParams()
  const { userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { pathname } = useLocation()
  const isApprovals = pathname.includes('/trades/approvals')
  const isDetail = pathname.match(/\/trades\/[^/]+$/) && !isApprovals

  // Don't show tabs on detail page
  if (isDetail) {
    return <Outlet />
  }

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <Link
          to="/orgs/$orgSlug/trades"
          params={{ orgSlug }}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            !isApprovals
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-gray-500 hover:text-navy-700 hover:border-gray-300',
          ].join(' ')}
        >
          Trade Board
        </Link>
        {canDo(userRole, 'approve-trade') && (
          <Link
            to="/orgs/$orgSlug/trades/approvals"
            params={{ orgSlug }}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              isApprovals
                ? 'border-red-700 text-red-700'
                : 'border-transparent text-gray-500 hover:text-navy-700 hover:border-gray-300',
            ].join(' ')}
          >
            Approvals
          </Link>
        )}
      </div>

      <Outlet />
    </div>
  )
}
