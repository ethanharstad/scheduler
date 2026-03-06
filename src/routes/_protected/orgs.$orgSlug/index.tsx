import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import type { OrgRole } from '@/lib/org.types'
import { canDo, getPermissions } from '@/lib/rbac'
import type { Permission } from '@/lib/rbac.types'
import { listStaffServerFn } from '@/server/staff'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/')({
  head: () => ({
    meta: [{ title: 'Dashboard | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const result = await listStaffServerFn({ data: { orgSlug: params.orgSlug } })
    const members = result.success ? result.members : []
    return {
      activeCount: members.filter((m) => m.status !== 'pending').length,
      totalCount: members.length,
    }
  },
  component: OrgDashboard,
})

function OrgDashboard() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { activeCount, totalCount } = Route.useLoaderData()

  const roleBadgeColors: Record<string, string> = {
    owner: 'bg-navy-100 text-navy-700',
    admin: 'bg-gray-100 text-gray-700',
    manager: 'bg-info-bg text-info',
    employee: 'bg-success-bg text-success',
    payroll_hr: 'bg-warning-bg text-warning',
  }

  const roleLabels: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    manager: 'Manager',
    employee: 'Employee',
    payroll_hr: 'Payroll / HR',
  }

  const createdDate = new Date(org.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy-700 mb-1">{org.name}</h1>
        <p className="text-gray-500 text-sm">Created {createdDate}</p>
      </div>

      <div>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>Your Role</span>
        <div className="mt-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${roleBadgeColors[userRole] ?? roleBadgeColors.employee}`}
            style={{ fontFamily: 'var(--font-condensed)' }}
          >
            {roleLabels[userRole] ?? userRole}
          </span>
        </div>
      </div>

      <PermissionsSummary userRole={userRole} />

      {canDo(userRole, 'edit-org-settings') && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-navy-700 mb-1">Organization Settings</h2>
          <p className="text-gray-600 text-sm mb-3">
            Manage your organization's settings{canDo(userRole, 'manage-billing') ? ', members, and billing.' : ' and members.'}
          </p>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>
            Coming soon
          </span>
        </div>
      )}

      <Link
        to="/orgs/$orgSlug/staff"
        params={{ orgSlug: org.slug }}
        className="block rounded-lg border border-gray-200 bg-white p-6 hover:border-navy-300 hover:shadow-sm transition-all group"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
              Active Staff
            </h2>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-navy-700">{activeCount}</span>
              <span className="text-sm text-gray-400">of {totalCount} total</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-navy-50 flex items-center justify-center group-hover:bg-navy-100 transition-colors">
            <Users className="w-5 h-5 text-navy-600" />
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2 group-hover:text-navy-600 transition-colors">
          View and manage staff &rarr;
        </p>
      </Link>
    </div>
  )
}

const PERMISSION_LABELS: Record<Permission, string> = {
  'view-org-settings': 'View organization settings',
  'edit-org-settings': 'Edit organization settings',
  'manage-billing': 'Manage billing',
  'invite-members': 'Invite members',
  'remove-members': 'Remove members',
  'assign-roles': 'Assign member roles',
  'transfer-ownership': 'Transfer ownership',
  'create-edit-schedules': 'Create and edit schedules',
  'view-schedules': 'View schedules',
  'approve-time-off': 'Approve time-off requests',
  'submit-time-off': 'Submit time-off requests',
  'view-reports': 'View reports',
  'access-payroll-hr': 'Access payroll and HR features',
}

function PermissionsSummary({ userRole }: { userRole: OrgRole }) {
  const permissions = getPermissions(userRole)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>
        Your Permissions
      </h2>
      <ul className="space-y-1">
        {permissions.map((p) => (
          <li key={p} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="text-success">✓</span>
            {PERMISSION_LABELS[p]}
          </li>
        ))}
      </ul>
    </div>
  )
}
