import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/schedules')({
  component: SchedulesLayout,
})

function SchedulesLayout() {
  const { orgSlug } = Route.useParams()
  const { pathname } = useLocation()
  const isPlatoons = pathname.includes('/schedules/platoons')
  const isRequirements = pathname.endsWith('/requirements')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <Link
          to="/orgs/$orgSlug/schedules"
          params={{ orgSlug }}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            !isRequirements && !isPlatoons
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-gray-500 hover:text-navy-700 hover:border-gray-300',
          ].join(' ')}
        >
          Schedules
        </Link>
        <Link
          to="/orgs/$orgSlug/schedules/requirements"
          params={{ orgSlug }}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            isRequirements
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-gray-500 hover:text-navy-700 hover:border-gray-300',
          ].join(' ')}
        >
          Requirements
        </Link>
        <Link
          to="/orgs/$orgSlug/schedules/platoons"
          params={{ orgSlug }}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            isPlatoons
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-gray-500 hover:text-navy-700 hover:border-gray-300',
          ].join(' ')}
        >
          Platoons
        </Link>
      </div>

      <Outlet />
    </div>
  )
}
