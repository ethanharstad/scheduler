export interface ScheduleRequirementView {
  id: string
  name: string
  positionId: string | null
  positionName: string | null
  minStaff: number
  maxStaff: number | null
  effectiveStart: string    // YYYY-MM-DD
  effectiveEnd: string | null  // YYYY-MM-DD; null = no end date
  rrule: string            // e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
  createdAt: string
  updatedAt: string
}

export type ListScheduleRequirementsInput   = { orgSlug: string }
export type ListScheduleRequirementsOutput  = { success: true; requirements: ScheduleRequirementView[] } | { success: false; error: 'UNAUTHORIZED' }

export type CreateScheduleRequirementInput  = { orgSlug: string; name: string; positionId?: string | null; minStaff: number; maxStaff?: number | null; effectiveStart: string; effectiveEnd?: string | null; rrule: string }
export type CreateScheduleRequirementOutput = { success: true; requirementId: string } | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' }

export type UpdateScheduleRequirementInput  = { orgSlug: string; requirementId: string; name: string; positionId?: string | null; minStaff: number; maxStaff?: number | null; effectiveStart: string; effectiveEnd?: string | null; rrule: string }
export type UpdateScheduleRequirementOutput = { success: true } | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' }

export type DeleteScheduleRequirementInput  = { orgSlug: string; requirementId: string }
export type DeleteScheduleRequirementOutput = { success: true } | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }
