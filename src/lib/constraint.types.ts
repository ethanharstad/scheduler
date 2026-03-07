export type ConstraintType = 'time_off' | 'unavailable' | 'preferred' | 'not_preferred'
export type ConstraintStatus = 'pending' | 'approved' | 'denied'

export interface ConstraintView {
  id: string
  staffMemberId: string
  staffMemberName: string
  type: ConstraintType
  status: ConstraintStatus
  startDatetime: string       // ISO 8601
  endDatetime: string         // ISO 8601
  daysOfWeek: number[] | null // null = not recurring
  reason: string | null
  reviewerName: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ListConstraintsInput { orgSlug: string; staffMemberId?: string }
export interface ListPendingTimeOffInput { orgSlug: string }

export interface CreateConstraintInput {
  orgSlug: string
  staffMemberId?: string   // omit = self; managers provide for others
  type: ConstraintType
  startDatetime: string
  endDatetime: string
  daysOfWeek?: number[]
  reason?: string
}

export interface UpdateConstraintInput {
  orgSlug: string
  constraintId: string
  startDatetime?: string
  endDatetime?: string
  daysOfWeek?: number[] | null
  reason?: string | null
}

export interface DeleteConstraintInput { orgSlug: string; constraintId: string }

export interface ReviewConstraintInput {
  orgSlug: string
  constraintId: string
  decision: 'approved' | 'denied'
}

// Output types

export type ListConstraintsOutput =
  | { success: true; constraints: ConstraintView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NO_STAFF_RECORD' }

export type ListPendingTimeOffOutput =
  | { success: true; constraints: ConstraintView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' }

export type CreateConstraintOutput =
  | { success: true; constraint: ConstraintView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NO_STAFF_RECORD' | 'NOT_FOUND' | 'VALIDATION_ERROR' }

export type UpdateConstraintOutput =
  | { success: true; constraint: ConstraintView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONSTRAINT_REVIEWED' | 'VALIDATION_ERROR' }

export type DeleteConstraintOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export type ReviewConstraintOutput =
  | { success: true; constraint: ConstraintView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_REVIEWED' | 'WRONG_TYPE' }
