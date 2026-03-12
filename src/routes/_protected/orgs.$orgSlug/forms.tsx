import { createFileRoute, Outlet, Link, useRouteContext, useMatchRoute } from '@tanstack/react-router'
import { canDo } from '@/lib/rbac'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/forms')({
  component: FormsLayout,
})

function FormsLayout() {
  const { userRole, org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const canManage = canDo(userRole, 'manage-forms')
  const matchRoute = useMatchRoute()
  const hideHeader =
    !!matchRoute({ to: '/orgs/$orgSlug/forms/fill/$templateId', params: { orgSlug: org.slug } }) ||
    !!matchRoute({ to: '/orgs/$orgSlug/forms/templates/new', params: { orgSlug: org.slug } }) ||
    !!matchRoute({ to: '/orgs/$orgSlug/forms/templates/$templateId', params: { orgSlug: org.slug } }) ||
    !!matchRoute({ to: '/orgs/$orgSlug/forms/submissions/$submissionId', params: { orgSlug: org.slug } })

  return (
    <div className="flex-1 min-w-0">
      {!hideHeader && (
        <>
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
                Forms
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Manage form templates and view submissions for {org.name}.</p>
            </div>
            {canManage && (
              <Link
                to="/orgs/$orgSlug/forms/templates/new"
                params={{ orgSlug: org.slug }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 transition-colors"
              >
                + New Template
              </Link>
            )}
          </div>
          <nav className="flex gap-1 border-b border-gray-200 mt-4 mb-6">
            <Link
              to="/orgs/$orgSlug/forms"
              params={{ orgSlug: org.slug }}
              activeOptions={{ exact: true }}
              className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-gray-500 hover:text-navy-700 [&.active]:border-red-700 [&.active]:text-red-700"
            >
              Templates
            </Link>
            <Link
              to="/orgs/$orgSlug/forms/submissions"
              params={{ orgSlug: org.slug }}
              className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-gray-500 hover:text-navy-700 [&.active]:border-red-700 [&.active]:text-red-700"
            >
              Submissions
            </Link>
          </nav>
        </>
      )}
      <Outlet />
    </div>
  )
}
