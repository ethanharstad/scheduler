import type { OrgRole } from '@/lib/org.types'

export interface RankView {
  id: string
  name: string
  sortOrder: number
}

export interface CertLevelView {
  id: string
  certTypeId: string
  name: string
  levelOrder: number
}

export interface CertTypeView {
  id: string
  name: string
  description: string | null
  isLeveled: boolean
  levels: CertLevelView[]
}

export interface StaffCertView {
  id: string
  staffMemberId: string
  certTypeId: string
  certTypeName: string
  certLevelId: string | null
  certLevelName: string | null
  issuedAt: string | null
  expiresAt: string | null
  certNumber: string | null
  notes: string | null
  status: 'active' | 'expired' | 'revoked'
  isExpiringSoon: boolean
}

export interface PositionView {
  id: string
  name: string
  description: string | null
  minRankId: string | null
  minRankName: string | null
  sortOrder: number
  requirements: Array<{
    id: string
    certTypeId: string
    certTypeName: string
    minCertLevelId: string | null
    minCertLevelName: string | null
  }>
}

export interface EligibleStaffMember {
  staffMemberId: string
  name: string
  rankName: string | null
  certsSummary: string
  hasExpiringCerts: boolean
  constraintType: 'preferred' | 'not_preferred' | 'unavailable' | 'time_off' | null
  isScheduledAdjacent: boolean
}

export interface EligibilityWarning {
  type: 'RANK_NOT_MET' | 'CERT_MISSING' | 'CERT_EXPIRED' | 'CERT_EXPIRING_SOON' | 'CERT_LEVEL_NOT_MET'
  certTypeName?: string
  expiresAt?: string
  required?: string
  actual?: string | null
}

export interface StaffMemberDetailView {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: OrgRole
  status: string
  rankId: string | null
  rankName: string | null
  rankSortOrder: number | null
}

export interface ExpiringCertView {
  staffMemberId: string
  staffMemberName: string
  certTypeName: string
  expiresAt: string
  daysUntilExpiry: number
}

// ---------------------------------------------------------------------------
// Server function I/O types
// ---------------------------------------------------------------------------

export type ListRanksInput = { orgSlug: string }
export type ListRanksOutput =
  | { success: true; ranks: RankView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export type CreateRankInput = { orgSlug: string; name: string; sortOrder: number }
export type CreateRankOutput =
  | { success: true; rank: RankView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'DUPLICATE' | 'VALIDATION_ERROR' }

export type UpdateRankInput = { orgSlug: string; rankId: string; name?: string; sortOrder?: number }
export type UpdateRankOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE' }

export type DeleteRankInput = { orgSlug: string; rankId: string }
export type DeleteRankOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'IN_USE' }

export type ListCertTypesInput = { orgSlug: string }
export type ListCertTypesOutput =
  | { success: true; certTypes: CertTypeView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export type CreateCertTypeInput = {
  orgSlug: string
  name: string
  description?: string
  isLeveled: boolean
  levels?: Array<{ name: string; levelOrder: number }>
}
export type CreateCertTypeOutput =
  | { success: true; certType: CertTypeView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'DUPLICATE' | 'VALIDATION_ERROR' }

export type UpdateCertTypeInput = {
  orgSlug: string
  certTypeId: string
  name?: string
  description?: string | null
}
export type UpdateCertTypeOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE' }

export type UpsertCertLevelsInput = {
  orgSlug: string
  certTypeId: string
  levels: Array<{ name: string; levelOrder: number }>
}
export type UpsertCertLevelsOutput =
  | { success: true; levels: CertLevelView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'LEVELS_IN_USE' }

export type DeleteCertTypeInput = { orgSlug: string; certTypeId: string }
export type DeleteCertTypeOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'IN_USE' }

export type ListStaffCertsInput = { orgSlug: string; staffMemberId: string }
export type ListStaffCertsOutput =
  | { success: true; certs: StaffCertView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export type UpsertStaffCertInput = {
  orgSlug: string
  staffMemberId: string
  certTypeId: string
  certLevelId?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
  certNumber?: string | null
  notes?: string | null
}
export type UpsertStaffCertOutput =
  | { success: true; cert: StaffCertView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' }

export type RevokeStaffCertInput = { orgSlug: string; staffMemberId: string; certTypeId: string }
export type RevokeStaffCertOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export type ListPositionsInput = { orgSlug: string }
export type ListPositionsOutput =
  | { success: true; positions: PositionView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export type CreatePositionInput = {
  orgSlug: string
  name: string
  description?: string
  minRankId?: string | null
  sortOrder?: number
  requirements?: Array<{ certTypeId: string; minCertLevelId?: string | null }>
}
export type CreatePositionOutput =
  | { success: true; position: PositionView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'DUPLICATE' | 'VALIDATION_ERROR' }

export type UpdatePositionInput = {
  orgSlug: string
  positionId: string
  name?: string
  description?: string | null
  minRankId?: string | null
  sortOrder?: number
  requirements?: Array<{ certTypeId: string; minCertLevelId?: string | null }>
}
export type UpdatePositionOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE' }

export type DeletePositionInput = { orgSlug: string; positionId: string }
export type DeletePositionOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'IN_USE' }

export type SetStaffRankInput = { orgSlug: string; staffMemberId: string; rankId: string | null }
export type SetStaffRankOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export type CheckPositionEligibilityInput = {
  orgSlug: string
  positionId: string
  asOfDate: string  // YYYY-MM-DD
}
export type CheckPositionEligibilityOutput =
  | { success: true; eligible: EligibleStaffMember[]; positionName: string }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export type GetExpiringCertsOutput =
  | { success: true; certs: ExpiringCertView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export type GetStaffMemberDetailsOutput =
  | { success: true; staffMember: StaffMemberDetailView; certs: StaffCertView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }
