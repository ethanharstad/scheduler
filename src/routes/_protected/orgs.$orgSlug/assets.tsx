import { createFileRoute, Outlet, Link, useRouteContext, useMatchRoute } from '@tanstack/react-router'
import { canDo } from '@/lib/rbac'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets')({
  component: AssetsLayout,
})

function AssetsLayout() {
  const { userRole, org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const canManage = canDo(userRole, 'manage-assets')
  const matchRoute = useMatchRoute()
  const onDetailPage = !!matchRoute({ to: '/orgs/$orgSlug/assets/$assetId', params: { orgSlug: org.slug } })
  const onNewPage = !!matchRoute({ to: '/orgs/$orgSlug/assets/new', params: { orgSlug: org.slug } })
  const hideHeader = onDetailPage || onNewPage

  return (
    <div className="flex-1 min-w-0">
      {!hideHeader && (
        <>
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
                Asset Management
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Manage apparatus and gear for {org.name}.</p>
            </div>
            {canManage && (
              <Link
                to="/orgs/$orgSlug/assets/new"
                params={{ orgSlug: org.slug }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 transition-colors"
              >
                + Add Asset
              </Link>
            )}
          </div>
          <nav className="flex gap-1 border-b border-gray-200 mt-4 mb-6">
            <Link
              to="/orgs/$orgSlug/assets"
              params={{ orgSlug: org.slug }}
              activeOptions={{ exact: true }}
              className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-gray-500 hover:text-navy-700 [&.active]:border-red-700 [&.active]:text-red-700"
            >
              Inventory
            </Link>
            <Link
              to="/orgs/$orgSlug/assets/my-gear"
              params={{ orgSlug: org.slug }}
              className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-gray-500 hover:text-navy-700 [&.active]:border-red-700 [&.active]:text-red-700"
            >
              My Gear
            </Link>
          </nav>
        </>
      )}
      <Outlet />
    </div>
  )
}
