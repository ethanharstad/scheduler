import { createServerFn } from '@tanstack/react-start'
import { canDo } from '@/lib/rbac'
import { requireOrgMembership } from '@/server/_helpers'
import type {
  CreateScheduleInput,
  UpdateScheduleInput,
  DeleteScheduleInput,
  CreateAssignmentInput,
  CreateRecurringAssignmentsInput,
  UpdateAssignmentInput,
  DeleteAssignmentInput,
  ScheduleView,
  ShiftAssignmentView,
} from '@/lib/schedule.types'

// ---------------------------------------------------------------------------
// listSchedulesServerFn
// ---------------------------------------------------------------------------

type ListSchedulesOutput =
  | { success: true; schedules: ScheduleView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export const listSchedulesServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { orgSlug: string }) => d)
  .handler(async (ctx): Promise<ListSchedulesOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership || !canDo(membership.role, 'view-schedules')) {
      return { success: false, error: 'UNAUTHORIZED' }
    }

    type ScheduleRow = {
      id: string
      name: string
      start_date: string
      end_date: string
      status: string
      created_by_name: string | null
      assignment_count: number
      created_at: string
    }

    const rows = await env.DB.prepare(
      `SELECT s.id, s.name, s.start_date, s.end_date, s.status,
              p.display_name AS created_by_name,
              (SELECT COUNT(*) FROM shift_assignment sa WHERE sa.schedule_id = s.id) AS assignment_count,
              s.created_at
       FROM schedule s
       LEFT JOIN user_profile p ON p.user_id = s.created_by
       WHERE s.org_id = ?
       ORDER BY s.start_date DESC, s.name ASC`,
    )
      .bind(membership.orgId)
      .all<ScheduleRow>()

    const schedules: ScheduleView[] = (rows.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status as ScheduleView['status'],
      createdByName: r.created_by_name,
      assignmentCount: r.assignment_count,
      createdAt: r.created_at,
    }))

    return { success: true, schedules }
  })

// ---------------------------------------------------------------------------
// getScheduleServerFn
// ---------------------------------------------------------------------------

type GetScheduleOutput =
  | { success: true; schedule: ScheduleView; assignments: ShiftAssignmentView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export const getScheduleServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { orgSlug: string; scheduleId: string }) => d)
  .handler(async (ctx): Promise<GetScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership || !canDo(membership.role, 'view-schedules')) {
      return { success: false, error: 'UNAUTHORIZED' }
    }

    type ScheduleRow = {
      id: string
      name: string
      start_date: string
      end_date: string
      status: string
      created_by_name: string | null
      created_at: string
    }

    const scheduleRow = await env.DB.prepare(
      `SELECT s.id, s.name, s.start_date, s.end_date, s.status,
              p.display_name AS created_by_name, s.created_at
       FROM schedule s
       LEFT JOIN user_profile p ON p.user_id = s.created_by
       WHERE s.id = ? AND s.org_id = ?`,
    )
      .bind(data.scheduleId, membership.orgId)
      .first<ScheduleRow>()

    if (!scheduleRow) return { success: false, error: 'NOT_FOUND' }

    type AssignmentRow = {
      id: string
      staff_member_id: string
      staff_member_name: string
      start_datetime: string
      end_datetime: string
      position: string | null
      notes: string | null
    }

    const assignmentRows = await env.DB.prepare(
      `SELECT sa.id, sa.staff_member_id, sm.name AS staff_member_name,
              sa.start_datetime, sa.end_datetime, sa.position, sa.notes
       FROM shift_assignment sa
       JOIN staff_member sm ON sm.id = sa.staff_member_id
       WHERE sa.schedule_id = ?
       ORDER BY sa.start_datetime ASC, sm.name ASC`,
    )
      .bind(data.scheduleId)
      .all<AssignmentRow>()

    // Count assignments for view
    const assignmentCount = assignmentRows.results?.length ?? 0

    const schedule: ScheduleView = {
      id: scheduleRow.id,
      name: scheduleRow.name,
      startDate: scheduleRow.start_date,
      endDate: scheduleRow.end_date,
      status: scheduleRow.status as ScheduleView['status'],
      createdByName: scheduleRow.created_by_name,
      assignmentCount,
      createdAt: scheduleRow.created_at,
    }

    const assignments: ShiftAssignmentView[] = (assignmentRows.results ?? []).map((r) => ({
      id: r.id,
      staffMemberId: r.staff_member_id,
      staffMemberName: r.staff_member_name,
      startDatetime: r.start_datetime,
      endDatetime: r.end_datetime,
      position: r.position,
      notes: r.notes,
    }))

    return { success: true, schedule, assignments }
  })

// ---------------------------------------------------------------------------
// createScheduleServerFn
// ---------------------------------------------------------------------------

type CreateScheduleOutput =
  | { success: true; schedule: ScheduleView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' }

export const createScheduleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateScheduleInput) => d)
  .handler(async (ctx): Promise<CreateScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const name = data.name?.trim()
    if (!name || !data.startDate || !data.endDate || data.endDate < data.startDate) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    await env.DB.prepare(
      `INSERT INTO schedule (id, org_id, name, start_date, end_date, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    )
      .bind(id, membership.orgId, name, data.startDate, data.endDate, membership.userId, now, now)
      .run()

    const schedule: ScheduleView = {
      id,
      name,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'draft',
      createdByName: null,
      assignmentCount: 0,
      createdAt: now,
    }

    return { success: true, schedule }
  })

// ---------------------------------------------------------------------------
// updateScheduleServerFn
// ---------------------------------------------------------------------------

type UpdateScheduleOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' }

export const updateScheduleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateScheduleInput) => d)
  .handler(async (ctx): Promise<UpdateScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type ScheduleRow = { id: string; start_date: string; end_date: string; name: string }
    const existing = await env.DB.prepare(
      `SELECT id, start_date, end_date, name FROM schedule WHERE id = ? AND org_id = ?`,
    )
      .bind(data.scheduleId, membership.orgId)
      .first<ScheduleRow>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const name = data.name !== undefined ? data.name.trim() : existing.name
    const startDate = data.startDate ?? existing.start_date
    const endDate = data.endDate ?? existing.end_date

    if (!name || endDate < startDate) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const status = data.status ?? undefined
    if (status && status !== 'draft' && status !== 'published') {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const now = new Date().toISOString()

    if (status) {
      await env.DB.prepare(
        `UPDATE schedule SET name = ?, start_date = ?, end_date = ?, status = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(name, startDate, endDate, status, now, data.scheduleId)
        .run()
    } else {
      await env.DB.prepare(
        `UPDATE schedule SET name = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(name, startDate, endDate, now, data.scheduleId)
        .run()
    }

    return { success: true }
  })

// ---------------------------------------------------------------------------
// deleteScheduleServerFn
// ---------------------------------------------------------------------------

type DeleteScheduleOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export const deleteScheduleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteScheduleInput) => d)
  .handler(async (ctx): Promise<DeleteScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type Row = { id: string }
    const existing = await env.DB.prepare(
      `SELECT id FROM schedule WHERE id = ? AND org_id = ?`,
    )
      .bind(data.scheduleId, membership.orgId)
      .first<Row>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    await env.DB.prepare(`DELETE FROM schedule WHERE id = ?`)
      .bind(data.scheduleId)
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// createAssignmentServerFn
// ---------------------------------------------------------------------------

type CreateAssignmentOutput =
  | { success: true; assignment: ShiftAssignmentView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' }

export const createAssignmentServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateAssignmentInput) => d)
  .handler(async (ctx): Promise<CreateAssignmentOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    // Verify schedule belongs to org
    type ScheduleRow = { id: string }
    const schedule = await env.DB.prepare(
      `SELECT id FROM schedule WHERE id = ? AND org_id = ?`,
    )
      .bind(data.scheduleId, membership.orgId)
      .first<ScheduleRow>()
    if (!schedule) return { success: false, error: 'NOT_FOUND' }

    // Verify staff member belongs to org
    type StaffRow = { id: string; name: string }
    const staff = await env.DB.prepare(
      `SELECT id, name FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()
    if (!staff) return { success: false, error: 'NOT_FOUND' }

    if (!data.startDatetime || !data.endDatetime || data.endDatetime <= data.startDatetime) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    await env.DB.prepare(
      `INSERT INTO shift_assignment (id, schedule_id, staff_member_id, start_datetime, end_datetime, position, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        data.scheduleId,
        data.staffMemberId,
        data.startDatetime,
        data.endDatetime,
        data.position?.trim() || null,
        data.notes?.trim() || null,
        now,
        now,
      )
      .run()

    const assignment: ShiftAssignmentView = {
      id,
      staffMemberId: data.staffMemberId,
      staffMemberName: staff.name,
      startDatetime: data.startDatetime,
      endDatetime: data.endDatetime,
      position: data.position?.trim() || null,
      notes: data.notes?.trim() || null,
    }

    return { success: true, assignment }
  })

// ---------------------------------------------------------------------------
// updateAssignmentServerFn
// ---------------------------------------------------------------------------

type UpdateAssignmentOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' }

export const updateAssignmentServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateAssignmentInput) => d)
  .handler(async (ctx): Promise<UpdateAssignmentOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    // Verify assignment belongs to a schedule in this org
    type AssignmentRow = {
      id: string
      staff_member_id: string
      start_datetime: string
      end_datetime: string
      position: string | null
      notes: string | null
    }
    const existing = await env.DB.prepare(
      `SELECT sa.id, sa.staff_member_id, sa.start_datetime, sa.end_datetime, sa.position, sa.notes
       FROM shift_assignment sa
       JOIN schedule s ON s.id = sa.schedule_id
       WHERE sa.id = ? AND s.org_id = ?`,
    )
      .bind(data.assignmentId, membership.orgId)
      .first<AssignmentRow>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const staffMemberId = data.staffMemberId ?? existing.staff_member_id
    const startDatetime = data.startDatetime ?? existing.start_datetime
    const endDatetime = data.endDatetime ?? existing.end_datetime
    const position = data.position !== undefined ? (data.position?.trim() || null) : existing.position
    const notes = data.notes !== undefined ? (data.notes?.trim() || null) : existing.notes

    if (endDatetime <= startDatetime) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    // If staff member changed, verify they belong to org
    if (data.staffMemberId && data.staffMemberId !== existing.staff_member_id) {
      type StaffRow = { id: string }
      const staff = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
      )
        .bind(data.staffMemberId, membership.orgId)
        .first<StaffRow>()
      if (!staff) return { success: false, error: 'NOT_FOUND' }
    }

    const now = new Date().toISOString()

    await env.DB.prepare(
      `UPDATE shift_assignment SET staff_member_id = ?, start_datetime = ?, end_datetime = ?, position = ?, notes = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(staffMemberId, startDatetime, endDatetime, position, notes, now, data.assignmentId)
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// deleteAssignmentServerFn
// ---------------------------------------------------------------------------

type DeleteAssignmentOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export const deleteAssignmentServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteAssignmentInput) => d)
  .handler(async (ctx): Promise<DeleteAssignmentOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    // Verify assignment belongs to a schedule in this org
    type Row = { id: string }
    const existing = await env.DB.prepare(
      `SELECT sa.id FROM shift_assignment sa
       JOIN schedule s ON s.id = sa.schedule_id
       WHERE sa.id = ? AND s.org_id = ?`,
    )
      .bind(data.assignmentId, membership.orgId)
      .first<Row>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    await env.DB.prepare(`DELETE FROM shift_assignment WHERE id = ?`)
      .bind(data.assignmentId)
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// createRecurringAssignmentsServerFn
// ---------------------------------------------------------------------------

type CreateRecurringOutput =
  | { success: true; assignments: ShiftAssignmentView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' }

export const createRecurringAssignmentsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateRecurringAssignmentsInput) => d)
  .handler(async (ctx): Promise<CreateRecurringOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    if (!data.startTime || !data.endTime) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    if (data.mode === 'days-of-week') {
      if (!data.daysOfWeek || data.daysOfWeek.length === 0 || !data.daysOfWeek.every((d) => d >= 0 && d <= 6)) {
        return { success: false, error: 'VALIDATION_ERROR' }
      }
    } else if (data.mode === 'every-n-days') {
      if (!data.everyNDays || data.everyNDays < 1 || !data.startingFrom) {
        return { success: false, error: 'VALIDATION_ERROR' }
      }
    } else {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    // Verify schedule belongs to org and get date range
    type ScheduleRow = { id: string; start_date: string; end_date: string }
    const schedule = await env.DB.prepare(
      `SELECT id, start_date, end_date FROM schedule WHERE id = ? AND org_id = ?`,
    )
      .bind(data.scheduleId, membership.orgId)
      .first<ScheduleRow>()
    if (!schedule) return { success: false, error: 'NOT_FOUND' }

    // Verify staff member belongs to org
    type StaffRow = { id: string; name: string }
    const staff = await env.DB.prepare(
      `SELECT id, name FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()
    if (!staff) return { success: false, error: 'NOT_FOUND' }

    const end = new Date(schedule.end_date + 'T00:00:00')
    const now = new Date().toISOString()
    const position = data.position?.trim() || null
    const notes = data.notes?.trim() || null
    const crossesMidnight = data.endTime <= data.startTime

    // Build list of dates that should get an assignment
    const matchingDates: Date[] = []

    if (data.mode === 'days-of-week') {
      const daysSet = new Set(data.daysOfWeek!)
      const current = new Date(schedule.start_date + 'T00:00:00')
      while (current <= end) {
        if (daysSet.has(current.getDay())) {
          matchingDates.push(new Date(current))
        }
        current.setDate(current.getDate() + 1)
      }
    } else {
      // every-n-days: start from startingFrom, step by everyNDays
      const scheduleStart = new Date(schedule.start_date + 'T00:00:00')
      const current = new Date(data.startingFrom! + 'T00:00:00')
      // If startingFrom is before schedule start, advance to first occurrence within range
      while (current < scheduleStart) {
        current.setDate(current.getDate() + data.everyNDays!)
      }
      while (current <= end) {
        matchingDates.push(new Date(current))
        current.setDate(current.getDate() + data.everyNDays!)
      }
    }

    if (matchingDates.length === 0) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const assignments: ShiftAssignmentView[] = []
    const stmts: D1PreparedStatement[] = []

    for (const date of matchingDates) {
      const dateStr = date.toISOString().slice(0, 10)
      const startDatetime = `${dateStr}T${data.startTime}`

      let endDatetime: string
      if (crossesMidnight) {
        const nextDay = new Date(date)
        nextDay.setDate(nextDay.getDate() + 1)
        endDatetime = `${nextDay.toISOString().slice(0, 10)}T${data.endTime}`
      } else {
        endDatetime = `${dateStr}T${data.endTime}`
      }

      const id = crypto.randomUUID()
      stmts.push(
        env.DB.prepare(
          `INSERT INTO shift_assignment (id, schedule_id, staff_member_id, start_datetime, end_datetime, position, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(id, data.scheduleId, data.staffMemberId, startDatetime, endDatetime, position, notes, now, now),
      )

      assignments.push({
        id,
        staffMemberId: data.staffMemberId,
        staffMemberName: staff.name,
        startDatetime,
        endDatetime,
        position,
        notes,
      })
    }

    await env.DB.batch(stmts)

    return { success: true, assignments }
  })
