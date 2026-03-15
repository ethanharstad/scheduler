import { describe, it, expect } from 'vitest'
import { canDo, getPermissions } from './rbac'
import type { OrgRole } from '@/lib/org.types'
import type { Permission } from '@/lib/rbac.types'

const ALL_PERMISSIONS: Permission[] = [
  'view-org-settings', 'edit-org-settings', 'manage-billing',
  'invite-members', 'remove-members', 'assign-roles', 'transfer-ownership',
  'create-edit-schedules', 'view-schedules', 'approve-time-off',
  'submit-time-off', 'view-reports', 'access-payroll-hr',
  'manage-certifications', 'view-certifications', 'manage-assets',
  'manage-forms', 'submit-forms', 'manage-stations',
  'submit-trade', 'approve-trade',
]

describe('canDo', () => {
  it('owner has all permissions', () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(canDo('owner', perm), `owner should have ${perm}`).toBe(true)
    }
  })

  it('admin lacks manage-billing and transfer-ownership', () => {
    expect(canDo('admin', 'manage-billing')).toBe(false)
    expect(canDo('admin', 'transfer-ownership')).toBe(false)
  })

  it('admin has other management permissions', () => {
    expect(canDo('admin', 'edit-org-settings')).toBe(true)
    expect(canDo('admin', 'invite-members')).toBe(true)
    expect(canDo('admin', 'manage-assets')).toBe(true)
  })

  it('manager has expected subset', () => {
    expect(canDo('manager', 'create-edit-schedules')).toBe(true)
    expect(canDo('manager', 'approve-time-off')).toBe(true)
    expect(canDo('manager', 'manage-assets')).toBe(true)
    expect(canDo('manager', 'submit-trade')).toBe(true)
    expect(canDo('manager', 'approve-trade')).toBe(true)
  })

  it('manager lacks org-level admin permissions', () => {
    expect(canDo('manager', 'view-org-settings')).toBe(false)
    expect(canDo('manager', 'edit-org-settings')).toBe(false)
    expect(canDo('manager', 'invite-members')).toBe(false)
    expect(canDo('manager', 'remove-members')).toBe(false)
    expect(canDo('manager', 'assign-roles')).toBe(false)
  })

  it('employee has minimal permissions', () => {
    const employeePerms: Permission[] = ['view-schedules', 'submit-time-off', 'submit-forms', 'submit-trade']
    for (const perm of employeePerms) {
      expect(canDo('employee', perm), `employee should have ${perm}`).toBe(true)
    }
    for (const perm of ALL_PERMISSIONS) {
      if (!employeePerms.includes(perm)) {
        expect(canDo('employee', perm), `employee should NOT have ${perm}`).toBe(false)
      }
    }
  })

  it('payroll_hr has payroll access but not management', () => {
    expect(canDo('payroll_hr', 'access-payroll-hr')).toBe(true)
    expect(canDo('payroll_hr', 'view-schedules')).toBe(true)
    expect(canDo('payroll_hr', 'view-reports')).toBe(true)
    expect(canDo('payroll_hr', 'view-certifications')).toBe(true)
    expect(canDo('payroll_hr', 'manage-assets')).toBe(false)
    expect(canDo('payroll_hr', 'create-edit-schedules')).toBe(false)
  })
})

describe('getPermissions', () => {
  it('returns correct count for each role', () => {
    expect(getPermissions('owner')).toHaveLength(ALL_PERMISSIONS.length)
    expect(getPermissions('admin')).toHaveLength(ALL_PERMISSIONS.length - 3)
    expect(getPermissions('employee')).toHaveLength(4)
    expect(getPermissions('payroll_hr')).toHaveLength(5)
  })

  it('returns an array', () => {
    const perms = getPermissions('owner')
    expect(Array.isArray(perms)).toBe(true)
  })

  it('manager permissions count', () => {
    expect(getPermissions('manager')).toHaveLength(11)
  })
})
