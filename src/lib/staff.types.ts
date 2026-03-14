import type { OrgRole } from '@/lib/org.types'

export type StaffStatus = 'roster_only' | 'pending' | 'active' | 'removed'

export type StaffAuditAction =
  | 'member_added'
  | 'member_removed'
  | 'member_linked'
  | 'role_changed'
  | 'invitation_sent'
  | 'invitation_cancelled'
  | 'invitation_resent'
  | 'invitation_accepted'
  | 'rank_changed'
  | 'trade_proposed'
  | 'trade_accepted'
  | 'trade_withdrawn'
  | 'trade_approved'
  | 'trade_denied'
  | 'trade_expired'
  | 'trade_cancelled_system'

/** Returned by listStaffServerFn */
export interface StaffMemberView {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: OrgRole
  status: StaffStatus
  userId: string | null
  rankName: string | null
  rankSortOrder: number | null
  platoonName: string | null
  platoonColor: string | null
  addedAt: string
  updatedAt: string
}

/** Returned by getStaffAuditLogServerFn */
export interface StaffAuditEntry {
  id: string
  staffMemberId: string | null
  staffMemberName: string | null
  performedByUserId: string | null
  performedByName: string | null
  action: StaffAuditAction
  metadata: Record<string, string> | null
  createdAt: string
}

/** Input for addStaffMemberServerFn */
export interface AddStaffMemberInput {
  orgSlug: string
  name: string
  email?: string
  phone?: string
  role: OrgRole
}

/** Input for inviteStaffMemberServerFn */
export interface InviteStaffMemberInput {
  orgSlug: string
  staffMemberId: string
}

/** Input for changeStaffRoleServerFn */
export interface ChangeStaffRoleInput {
  orgSlug: string
  staffMemberId: string
  newRole: OrgRole
}

/** Input for removeStaffMemberServerFn */
export interface RemoveStaffMemberInput {
  orgSlug: string
  staffMemberId: string
}

/** Input for cancelInvitationServerFn and resendInvitationServerFn */
export interface InvitationActionInput {
  orgSlug: string
  staffMemberId: string
}

/** Input for getInvitationByTokenServerFn (public) */
export interface GetInvitationInput {
  token: string
}

/** Returned by getInvitationByTokenServerFn */
export interface InvitationView {
  token: string
  orgName: string
  orgSlug: string
  email: string
  role: OrgRole
  inviterName: string | null
  expiresAt: string
}

/** Input for acceptInvitationServerFn (public) */
export interface AcceptInvitationInput {
  token: string
  /** Required when creating a new account */
  name?: string
  /** Required when creating a new account */
  password?: string
}

/** Input for getStaffAuditLogServerFn */
export interface GetStaffAuditLogInput {
  orgSlug: string
  limit?: number
  offset?: number
}
