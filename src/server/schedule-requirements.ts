import { createServerFn } from '@tanstack/react-start'
import { canDo } from '@/lib/rbac'
import { requireOrgMembership } from '@/server/_helpers'
import type {
  ListScheduleRequirementsInput,
  ListScheduleRequirementsOutput,
  CreateScheduleRequirementInput,
  CreateScheduleRequirementOutput,
  UpdateScheduleRequirementInput,
  UpdateScheduleRequirementOutput,
  DeleteScheduleRequirementInput,
  DeleteScheduleRequirementOutput,
  ScheduleRequirementView,
} from '@/lib/schedule-requirement.types'

type ReqRow = {
  id: string
  name: string
  position_id: string | null
  position_name: string | null
  min_staff: number
  max_staff: number | null
  effective_start: string
  effective_end: string | null
  rrule: string
  window_start_time: string | null
  window_end_time: string | null
  window_end_day_offset: number | null
  created_at: string
  updated_at: string
}

function rowToView(r: ReqRow): ScheduleRequirementView {
  return {
    id: r.id,
    name: r.name,
    positionId: r.position_id,
    positionName: r.position_name,
    minStaff: r.min_staff,
    maxStaff: r.max_staff,
    effectiveStart: r.effective_start,
    effectiveEnd: r.effective_end ?? null,
    rrule: r.rrule,
    windowStartTime: r.window_start_time,
    windowEndTime: r.window_end_time,
    windowEndDayOffset: r.window_end_day_offset,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function validateRequirementInput(data: {
  name: string
  minStaff: number
  maxStaff?: number | null
  effectiveStart: string
  effectiveEnd?: string | null
  rrule: string
  windowStartTime?: string | null
  windowEndTime?: string | null
  windowEndDayOffset?: number | null
}): string | null {
  if (!data.name || data.name.trim().length === 0 || data.name.length > 100) return 'VALIDATION_ERROR'
  if (data.minStaff < 0 || !Number.isInteger(data.minStaff)) return 'VALIDATION_ERROR'
  if (data.maxStaff != null && (data.maxStaff < data.minStaff || !Number.isInteger(data.maxStaff))) return 'VALIDATION_ERROR'
  if (!data.effectiveStart) return 'VALIDATION_ERROR'
  if (data.effectiveEnd && data.effectiveEnd < data.effectiveStart) return 'VALIDATION_ERROR'
  if (!data.rrule || data.rrule.trim().length === 0) return 'VALIDATION_ERROR'
  // Time window: either all three fields present, or none
  const hasStart = !!data.windowStartTime
  const hasEnd = !!data.windowEndTime
  const hasOffset = data.windowEndDayOffset != null
  if (hasStart || hasEnd || hasOffset) {
    if (!hasStart || !hasEnd || !hasOffset) return 'VALIDATION_ERROR'
    if (!TIME_RE.test(data.windowStartTime!)) return 'VALIDATION_ERROR'
    if (!TIME_RE.test(data.windowEndTime!)) return 'VALIDATION_ERROR'
    if (!Number.isInteger(data.windowEndDayOffset!) || data.windowEndDayOffset! < 0) return 'VALIDATION_ERROR'
  }
  return null
}

export const listScheduleRequirementsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListScheduleRequirementsInput) => d)
  .handler(async (ctx): Promise<ListScheduleRequirementsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const rows = await env.DB.prepare(
      `SELECT sr.id, sr.name, sr.position_id, p.name AS position_name,
              sr.min_staff, sr.max_staff, sr.effective_start, sr.effective_end,
              sr.rrule, sr.window_start_time, sr.window_end_time, sr.window_end_day_offset,
              sr.created_at, sr.updated_at
       FROM schedule_requirement sr
       LEFT JOIN position p ON p.id = sr.position_id
       WHERE sr.org_id = ?
       ORDER BY sr.effective_start ASC, sr.name ASC`,
    )
      .bind(membership.orgId)
      .all<ReqRow>()

    return { success: true, requirements: (rows.results ?? []).map(rowToView) }
  })

export const createScheduleRequirementServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateScheduleRequirementInput) => d)
  .handler(async (ctx): Promise<CreateScheduleRequirementOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) return { success: false, error: 'FORBIDDEN' }

    const validationError = validateRequirementInput(data)
    if (validationError) return { success: false, error: 'VALIDATION_ERROR' }

    if (data.positionId) {
      const posRow = await env.DB.prepare(
        `SELECT id FROM position WHERE id = ? AND org_id = ?`,
      )
        .bind(data.positionId, membership.orgId)
        .first<{ id: string }>()
      if (!posRow) return { success: false, error: 'VALIDATION_ERROR' }
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const hasWindow = !!(data.windowStartTime && data.windowEndTime && data.windowEndDayOffset != null)

    await env.DB.prepare(
      `INSERT INTO schedule_requirement (id, org_id, name, position_id, min_staff, max_staff, effective_start, effective_end, rrule, window_start_time, window_end_time, window_end_day_offset, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        membership.orgId,
        data.name.trim(),
        data.positionId ?? null,
        data.minStaff,
        data.maxStaff ?? null,
        data.effectiveStart,
        data.effectiveEnd ?? null,
        data.rrule.trim(),
        hasWindow ? data.windowStartTime! : null,
        hasWindow ? data.windowEndTime! : null,
        hasWindow ? data.windowEndDayOffset! : null,
        membership.userId,
        now,
        now,
      )
      .run()

    return { success: true, requirementId: id }
  })

export const updateScheduleRequirementServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateScheduleRequirementInput) => d)
  .handler(async (ctx): Promise<UpdateScheduleRequirementOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) return { success: false, error: 'FORBIDDEN' }

    const existing = await env.DB.prepare(
      `SELECT org_id FROM schedule_requirement WHERE id = ?`,
    )
      .bind(data.requirementId)
      .first<{ org_id: string }>()
    if (!existing || existing.org_id !== membership.orgId) return { success: false, error: 'NOT_FOUND' }

    const validationError = validateRequirementInput(data)
    if (validationError) return { success: false, error: 'VALIDATION_ERROR' }

    if (data.positionId) {
      const posRow = await env.DB.prepare(
        `SELECT id FROM position WHERE id = ? AND org_id = ?`,
      )
        .bind(data.positionId, membership.orgId)
        .first<{ id: string }>()
      if (!posRow) return { success: false, error: 'VALIDATION_ERROR' }
    }

    const hasWindow = !!(data.windowStartTime && data.windowEndTime && data.windowEndDayOffset != null)

    await env.DB.prepare(
      `UPDATE schedule_requirement
       SET name = ?, position_id = ?, min_staff = ?, max_staff = ?,
           effective_start = ?, effective_end = ?, rrule = ?,
           window_start_time = ?, window_end_time = ?, window_end_day_offset = ?,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        data.name.trim(),
        data.positionId ?? null,
        data.minStaff,
        data.maxStaff ?? null,
        data.effectiveStart,
        data.effectiveEnd ?? null,
        data.rrule.trim(),
        hasWindow ? data.windowStartTime! : null,
        hasWindow ? data.windowEndTime! : null,
        hasWindow ? data.windowEndDayOffset! : null,
        new Date().toISOString(),
        data.requirementId,
      )
      .run()

    return { success: true }
  })

export const deleteScheduleRequirementServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteScheduleRequirementInput) => d)
  .handler(async (ctx): Promise<DeleteScheduleRequirementOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'create-edit-schedules')) return { success: false, error: 'FORBIDDEN' }

    const existing = await env.DB.prepare(
      `SELECT org_id FROM schedule_requirement WHERE id = ?`,
    )
      .bind(data.requirementId)
      .first<{ org_id: string }>()
    if (!existing || existing.org_id !== membership.orgId) return { success: false, error: 'NOT_FOUND' }

    await env.DB.prepare(`DELETE FROM schedule_requirement WHERE id = ?`)
      .bind(data.requirementId)
      .run()

    return { success: true }
  })
