import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import type { OrgRole } from '@/lib/org.types'
import { canDo, getPermissions } from '@/lib/rbac'
import type { Permission } from '@/lib/rbac.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/')({
  head: () => ({
    meta: [{ title: 'Dashboard | Scene Ready' }],
  }),
  component: OrgDashboard,
})

function OrgDashboard() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })

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

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-1">More features coming soon</h2>
        <p className="text-gray-500 text-sm">
          Departments, staff management, scheduling, and more will appear here as they are released.
        </p>
      </div>
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
