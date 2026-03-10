import type { OrgRole } from '@/lib/org.types'

export type Permission =
  | 'view-org-settings'
  | 'edit-org-settings'
  | 'manage-billing'
  | 'invite-members'
  | 'remove-members'
  | 'assign-roles'
  | 'transfer-ownership'
  | 'create-edit-schedules'
  | 'view-schedules'
  | 'approve-time-off'
  | 'submit-time-off'
  | 'view-reports'
  | 'access-payroll-hr'
  | 'manage-assets'

export interface OrgMemberView {
  memberId: string
  userId: string
  email: string
  displayName: string
  role: OrgRole
  joinedAt: string
}

// ---------------------------------------------------------------------------
// Server function I/O types
// ---------------------------------------------------------------------------

export type ListMembersInput = { orgSlug: string }
export type ListMembersOutput =
  | { success: true; members: OrgMemberView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export type ChangeMemberRoleInput = {
  orgSlug: string
  memberId: string
  newRole: OrgRole
}
export type ChangeMemberRoleOutput =
  | { success: true }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_ROLE' | 'LAST_OWNER'
    }

export type RemoveMemberInput = {
  orgSlug: string
  memberId: string
}
export type RemoveMemberOutput =
  | { success: true }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'FORBIDDEN' | 'LAST_OWNER'
    }

export type TransferOwnershipInput = {
  orgSlug: string
  newOwnerMemberId: string
}
export type TransferOwnershipOutput =
  | { success: true }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'FORBIDDEN' | 'SELF_TRANSFER'
    }

export type GetMemberPermissionsInput = { orgSlug: string }
export type GetMemberPermissionsOutput =
  | { success: true; role: OrgRole; permissions: Permission[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }
