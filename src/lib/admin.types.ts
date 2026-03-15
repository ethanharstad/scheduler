export interface AdminUserView {
  id: string
  email: string
  verified: boolean
  isSystemAdmin: boolean
  orgCount: number
  createdAt: string
}

export interface AdminOrgView {
  id: string
  slug: string
  name: string
  plan: string
  status: string
  memberCount: number
  createdAt: string
}

export interface AdminStats {
  totalUsers: number
  totalOrgs: number
  activeSessions: number
}

export type ListUsersInput = { page?: number; limit?: number }
export type ListUsersOutput =
  | { success: true; users: AdminUserView[]; total: number }
  | { success: false; error: 'UNAUTHORIZED' }

export type ListOrgsInput = { page?: number; limit?: number }
export type ListOrgsOutput =
  | { success: true; orgs: AdminOrgView[]; total: number }
  | { success: false; error: 'UNAUTHORIZED' }

export type ToggleAdminInput = { userId: string; enable: boolean }
export type ToggleAdminOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'LAST_ADMIN' | 'NOT_FOUND' }

export type AdminStatsOutput =
  | { success: true; stats: AdminStats }
  | { success: false; error: 'UNAUTHORIZED' }

// ---------------------------------------------------------------------------
// Org Backup & Restore
// ---------------------------------------------------------------------------

export interface OrgBackupMeta {
  version: number
  exportedAt: string
  exportedBy: string
  orgId: string
  orgSlug: string
  orgName: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRow = Record<string, any>

export interface OrgBackup {
  _meta: OrgBackupMeta
  d1: {
    organization: JsonRow
    org_memberships: JsonRow[]
    invitation_token_index: JsonRow[]
  }
  do: Record<string, JsonRow[]>
}

export type BackupOrgInput = { orgId: string }
export type RestoreOrgInput = { orgId: string; backup: OrgBackup }
