import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import type { OrgRole } from '@/lib/org.types'
import { canDo, getPermissions } from '@/lib/rbac'
import type { Permission } from '@/lib/rbac.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/')({
  component: OrgDashboard,
})

function OrgDashboard() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })

  const roleBadgeColors: Record<string, string> = {
    owner: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
    admin: 'bg-slate-500/20 text-slate-300 border border-slate-500/40',
    manager: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
    employee: 'bg-green-500/20 text-green-300 border border-green-500/40',
    payroll_hr: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
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
    <main className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">{org.name}</h1>
        <p className="text-gray-600 text-sm">Created {createdDate}</p>
      </div>

      <div className="mb-6">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Your Role</span>
        <div className="mt-2">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${roleBadgeColors[userRole] ?? roleBadgeColors.employee}`}
          >
            {roleLabels[userRole] ?? userRole}
          </span>
        </div>
      </div>

      <PermissionsSummary userRole={userRole} />

      {canDo(userRole, 'edit-org-settings') && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">Organization Settings</h2>
          <p className="text-gray-400 text-sm mb-3">
            Manage your organization's settings{canDo(userRole, 'manage-billing') ? ', members, and billing.' : ' and members.'}
          </p>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-700 text-xs text-gray-400">
            Coming soon
          </span>
        </div>
      )}

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        <h2 className="text-base font-semibold text-gray-300 mb-1">More features coming soon</h2>
        <p className="text-gray-500 text-sm">
          Departments, staff management, scheduling, and more will appear here as they are released.
        </p>
      </div>
    </main>
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
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5 mb-6">
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
        Your Permissions
      </h2>
      <ul className="space-y-1">
        {permissions.map((p) => (
          <li key={p} className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-green-400">✓</span>
            {PERMISSION_LABELS[p]}
          </li>
        ))}
      </ul>
    </div>
  )
}
