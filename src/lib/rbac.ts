import type { OrgRole } from '@/lib/org.types'
import type { Permission } from '@/lib/rbac.types'

const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    'view-org-settings',
    'edit-org-settings',
    'manage-billing',
    'invite-members',
    'remove-members',
    'assign-roles',
    'transfer-ownership',
    'create-edit-schedules',
    'view-schedules',
    'approve-time-off',
    'submit-time-off',
    'view-reports',
    'access-payroll-hr',
    'manage-certifications',
    'view-certifications',
    'manage-assets',
    'manage-forms',
    'submit-forms',
  ]),
  admin: new Set<Permission>([
    'view-org-settings',
    'edit-org-settings',
    'invite-members',
    'remove-members',
    'assign-roles',
    'create-edit-schedules',
    'view-schedules',
    'approve-time-off',
    'submit-time-off',
    'view-reports',
    'manage-certifications',
    'view-certifications',
    'manage-assets',
    'manage-forms',
    'submit-forms',
  ]),
  manager: new Set<Permission>([
    'create-edit-schedules',
    'view-schedules',
    'approve-time-off',
    'submit-time-off',
    'view-reports',
    'view-certifications',
    'manage-assets',
    'manage-forms',
    'submit-forms',
  ]),
  employee: new Set<Permission>(['view-schedules', 'submit-time-off', 'submit-forms']),
  payroll_hr: new Set<Permission>([
    'view-schedules',
    'submit-time-off',
    'view-reports',
    'access-payroll-hr',
    'view-certifications',
  ]),
}

export function canDo(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission)
}

export function getPermissions(role: OrgRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]]
}
