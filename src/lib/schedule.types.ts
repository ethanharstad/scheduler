export type ScheduleStatus = 'draft' | 'published'

export interface ScheduleView {
  id: string
  name: string
  startDate: string
  endDate: string
  status: ScheduleStatus
  createdByName: string | null
  assignmentCount: number
  createdAt: string
}

export interface ShiftAssignmentView {
  id: string
  staffMemberId: string
  staffMemberName: string
  startDatetime: string
  endDatetime: string
  position: string | null
  notes: string | null
}

export interface CreateScheduleInput {
  orgSlug: string
  name: string
  startDate: string
  endDate: string
}

export interface UpdateScheduleInput {
  orgSlug: string
  scheduleId: string
  name?: string
  startDate?: string
  endDate?: string
  status?: ScheduleStatus
}

export interface DeleteScheduleInput {
  orgSlug: string
  scheduleId: string
}

export interface CreateAssignmentInput {
  orgSlug: string
  scheduleId: string
  staffMemberId: string
  startDatetime: string
  endDatetime: string
  position?: string
  notes?: string
}

export interface UpdateAssignmentInput {
  orgSlug: string
  assignmentId: string
  staffMemberId?: string
  startDatetime?: string
  endDatetime?: string
  position?: string | null
  notes?: string | null
}

export interface DeleteAssignmentInput {
  orgSlug: string
  assignmentId: string
}

export type RecurrenceMode = 'days-of-week' | 'every-n-days'

export interface PopulateFromPlatoonsInput {
  orgSlug: string
  scheduleId: string
  platoonIds: string[]   // empty = all platoons in org
}

export interface CreateRecurringAssignmentsInput {
  orgSlug: string
  scheduleId: string
  staffMemberId: string
  startTime: string        // HH:MM
  endTime: string          // HH:MM (if <= startTime, treated as next day)
  mode: RecurrenceMode
  daysOfWeek?: number[]    // 0=Sun, 1=Mon, …, 6=Sat (required when mode = 'days-of-week')
  everyNDays?: number      // interval in days (required when mode = 'every-n-days')
  startingFrom?: string    // YYYY-MM-DD, first occurrence (required when mode = 'every-n-days')
  position?: string
  notes?: string
}
