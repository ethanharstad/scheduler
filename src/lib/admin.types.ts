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
