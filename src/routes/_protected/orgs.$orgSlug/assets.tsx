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

  return (
    <div className="flex-1 min-w-0">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
              Asset Management
            </h1>
          </div>
          {canManage && !onDetailPage && (
            <Link
              to="/orgs/$orgSlug/assets/new"
              params={{ orgSlug: org.slug }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 transition-colors"
            >
              + Add Asset
            </Link>
          )}
        </div>
        <nav className="flex gap-1 mt-4">
          <Link
            to="/orgs/$orgSlug/assets/"
            params={{ orgSlug: org.slug }}
            activeOptions={{ exact: true }}
            className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors [&.active]:bg-navy-700 [&.active]:text-white"
          >
            Inventory
          </Link>
          <Link
            to="/orgs/$orgSlug/assets/my-gear"
            params={{ orgSlug: org.slug }}
            className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors [&.active]:bg-navy-700 [&.active]:text-white"
          >
            My Gear
          </Link>
        </nav>
      </div>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  )
}
