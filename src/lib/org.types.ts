export type OrgRole = 'owner' | 'admin' | 'manager' | 'employee' | 'payroll_hr'
export type OrgStatus = 'active' | 'inactive'

/** D1 row shape for the `organization` table */
export interface Organization {
  id: string
  slug: string
  name: string
  plan: string
  status: OrgStatus
  created_at: string
}

/** D1 row shape for the `org_membership` table */
export interface OrgMembership {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  status: OrgStatus
  joined_at: string
}

/** Shape returned to the client for an organization */
export interface OrgView {
  id: string
  slug: string
  name: string
  plan: string
  scheduleDayStart: string  // HH:MM; e.g. "07:00"
  createdAt: string
}

export interface UpdateOrgSettingsInput {
  orgSlug: string
  scheduleDayStart: string  // HH:MM
}

export type UpdateOrgSettingsOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' }

/** Shape returned to the client for a user's org membership list entry */
export interface OrgMembershipView {
  orgId: string
  orgSlug: string
  orgName: string
  role: OrgRole
}

/** Input for createOrgServerFn */
export interface CreateOrgInput {
  name: string
  slug: string
}
