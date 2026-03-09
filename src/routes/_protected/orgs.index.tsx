import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { Building2, Plus } from 'lucide-react'
import type { OrgRole } from '@/lib/org.types'

export const Route = createFileRoute('/_protected/orgs/')({
  head: () => ({
    meta: [{ title: 'Organizations | Scene Ready' }],
  }),
  component: OrgsListPage,
})

const roleBadgeStyles: Record<OrgRole, string> = {
  owner: 'bg-red-100 text-red-700',
  admin: 'bg-navy-50 text-navy-700',
  manager: 'bg-info-bg text-info',
  employee: 'bg-gray-100 text-gray-600',
  payroll_hr: 'bg-warning-bg text-warning',
}

const roleLabels: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  payroll_hr: 'Payroll / HR',
}

function OrgsListPage() {
  const { orgs, atLimit } = getRouteApi('/_protected').useLoaderData()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-700">Organizations</h1>
        {!atLimit && (
          <Link
            to="/create-org"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-red-700 text-white text-sm font-semibold hover:bg-[#9A0C24] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Organization
          </Link>
        )}
      </div>

      {orgs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No organizations yet</h2>
          <p className="text-sm text-gray-500 mb-4">
            Create your first organization to get started.
          </p>
          <Link
            to="/create-org"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-red-700 text-white text-sm font-semibold hover:bg-[#9A0C24] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Organization
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orgs.map((org) => (
            <Link
              key={org.orgId}
              to="/orgs/$orgSlug"
              params={{ orgSlug: org.orgSlug }}
              className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-navy-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-base font-semibold text-navy-700">{org.orgName}</div>
                  <div className="text-sm text-gray-500">{org.orgSlug}</div>
                </div>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${roleBadgeStyles[org.role]}`}
                style={{ fontFamily: 'var(--font-condensed)' }}
              >
                {roleLabels[org.role]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
