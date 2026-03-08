// Raw DB row shapes

export interface Platoon {
  id: string
  org_id: string
  name: string
  shift_label: string
  rrules: string        // raw JSON TEXT from D1 — parse to RRuleEntry[]
  start_date: string
  shift_start_time: string
  shift_end_time: string
  description: string | null
  color: string | null
  created_at: string
  updated_at: string
}

export interface PlatoonMembership {
  id: string
  platoon_id: string
  staff_member_id: string
  position_id: string | null
  assigned_at: string
}

// ---------------------------------------------------------------------------
// RRuleEntry — one recurrence rule within a platoon's schedule pattern
// ---------------------------------------------------------------------------

/** One recurrence rule within a platoon's schedule pattern. */
export interface RRuleEntry {
  /** RRULE string without the "RRULE:" prefix, e.g. "FREQ=DAILY;INTERVAL=9" */
  rrule: string
  /** Days from the platoon's start_date at which this rule's DTSTART begins.
   *  0 for most patterns; California Swing uses 0, 2, and 4. */
  startOffset: number
}

// Client-facing view shapes

/** Returned in the list endpoint — includes member count */
export interface PlatoonView {
  id: string
  name: string
  shiftLabel: string
  rrules: RRuleEntry[]
  startDate: string
  shiftStartTime: string
  shiftEndTime: string
  description: string | null
  color: string | null
  memberCount: number
}

/** Returned in the detail endpoint — includes member names */
export interface PlatoonDetailView {
  id: string
  name: string
  shiftLabel: string
  rrules: RRuleEntry[]
  startDate: string
  shiftStartTime: string
  shiftEndTime: string
  description: string | null
  color: string | null
  members: PlatoonMemberView[]
}

/** A single member entry in a platoon detail view */
export interface PlatoonMemberView {
  staffMemberId: string
  name: string
  positionId: string | null
  positionName: string | null
}

/** A staff member available for assignment */
export interface StaffOption {
  id: string
  name: string
  currentPlatoonName: string | null
}

/** A position available for selection when assigning a member */
export interface PositionOption {
  id: string
  name: string
}

// Server function I/O types

// --- List ---
export type ListPlatoonsInput = { orgSlug: string }
export type ListPlatoonsOutput =
  | { success: true; platoons: PlatoonView[] }
  | { success: false; error: 'UNAUTHORIZED' }

// --- Get detail ---
export type GetPlatoonInput = { orgSlug: string; platoonId: string }
export type GetPlatoonOutput =
  | { success: true; platoon: PlatoonDetailView; allStaff: StaffOption[]; positions: PositionOption[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

// --- Create ---
export type CreatePlatoonInput = {
  orgSlug: string
  name: string
  shiftLabel: string
  rrules: RRuleEntry[]
  startDate: string
  shiftStartTime?: string
  shiftEndTime?: string
  description?: string
  color?: string
}
export type CreatePlatoonOutput =
  | { success: true; platoonId: string }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'DUPLICATE_NAME' | 'INVALID_RRULE' }

// --- Update ---
export type UpdatePlatoonInput = {
  orgSlug: string
  platoonId: string
  name: string
  shiftLabel: string
  rrules: RRuleEntry[]
  startDate: string
  shiftStartTime: string
  shiftEndTime: string
  description?: string
  color?: string
}
export type UpdatePlatoonOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE_NAME' | 'INVALID_RRULE' }

// --- Delete ---
export type DeletePlatoonInput = { orgSlug: string; platoonId: string }
export type DeletePlatoonOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

// --- Assign member ---
export type AssignMemberInput = {
  orgSlug: string
  platoonId: string
  staffMemberId: string
  positionId?: string
}
export type AssignMemberOutput =
  | { success: true; movedFrom: string | null }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'PLATOON_NOT_FOUND' | 'MEMBER_NOT_FOUND' }

// --- Remove member ---
export type RemoveMemberFromPlatoonInput = {
  orgSlug: string
  platoonId: string
  staffMemberId: string
}
export type RemoveMemberFromPlatoonOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }
