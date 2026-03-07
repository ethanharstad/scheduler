import { createServerFn } from '@tanstack/react-start'
import { canDo } from '@/lib/rbac'
import type {
  ConstraintView,
  CreateConstraintInput,
  CreateConstraintOutput,
  DeleteConstraintInput,
  DeleteConstraintOutput,
  ListConstraintsInput,
  ListConstraintsOutput,
  ListPendingTimeOffInput,
  ListPendingTimeOffOutput,
  ReviewConstraintInput,
  ReviewConstraintOutput,
  UpdateConstraintInput,
  UpdateConstraintOutput,
} from '@/lib/constraint.types'
import { requireOrgMembership } from '@/server/_helpers'

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function resolveStaffMemberId(
  env: Cloudflare.Env,
  orgId: string,
  userId: string,
): Promise<string | null> {
  type Row = { id: string }
  const row = await env.DB.prepare(
    `SELECT id FROM staff_member WHERE org_id = ? AND user_id = ? AND status != 'removed'`,
  )
    .bind(orgId, userId)
    .first<Row>()
  return row?.id ?? null
}

type ConstraintRow = {
  id: string
  staff_member_id: string
  staff_member_name: string
  type: string
  status: string
  start_datetime: string
  end_datetime: string
  days_of_week: string | null
  reason: string | null
  reviewer_name: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

function rowToView(r: ConstraintRow): ConstraintView {
  return {
    id: r.id,
    staffMemberId: r.staff_member_id,
    staffMemberName: r.staff_member_name,
    type: r.type as ConstraintView['type'],
    status: r.status as ConstraintView['status'],
    startDatetime: r.start_datetime,
    endDatetime: r.end_datetime,
    daysOfWeek: r.days_of_week ? (JSON.parse(r.days_of_week) as number[]) : null,
    reason: r.reason,
    reviewerName: r.reviewer_name,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const CONSTRAINT_SELECT = `
  SELECT
    c.id, c.staff_member_id, sm.name AS staff_member_name,
    c.type, c.status, c.start_datetime, c.end_datetime,
    c.days_of_week, c.reason,
    rp.display_name AS reviewer_name, c.reviewed_at,
    c.created_at, c.updated_at
  FROM staff_constraint c
  JOIN staff_member sm ON sm.id = c.staff_member_id
  LEFT JOIN user_profile rp ON rp.user_id = c.reviewer_id
`

function validateDatetimes(start: string, end: string): boolean {
  return end > start
}

function validateDaysOfWeek(days: number[]): boolean {
  return days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
}

// ---------------------------------------------------------------------------
// listConstraintsServerFn
// ---------------------------------------------------------------------------

export const listConstraintsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListConstraintsInput) => d)
  .handler(async (ctx): Promise<ListConstraintsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    let targetStaffId: string

    if (data.staffMemberId) {
      if (!canDo(membership.role, 'create-edit-schedules')) {
        return { success: false, error: 'FORBIDDEN' }
      }
      targetStaffId = data.staffMemberId
    } else {
      if (!canDo(membership.role, 'view-schedules')) {
        return { success: false, error: 'FORBIDDEN' }
      }
      const selfId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
      if (!selfId) return { success: false, error: 'NO_STAFF_RECORD' }
      targetStaffId = selfId
    }

    const rows = await env.DB.prepare(
      `${CONSTRAINT_SELECT}
       WHERE c.org_id = ? AND c.staff_member_id = ?
       ORDER BY c.start_datetime ASC`,
    )
      .bind(membership.orgId, targetStaffId)
      .all<ConstraintRow>()

    return { success: true, constraints: (rows.results ?? []).map(rowToView) }
  })

// ---------------------------------------------------------------------------
// listPendingTimeOffServerFn
// ---------------------------------------------------------------------------

export const listPendingTimeOffServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListPendingTimeOffInput) => d)
  .handler(async (ctx): Promise<ListPendingTimeOffOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'approve-time-off')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const rows = await env.DB.prepare(
      `${CONSTRAINT_SELECT}
       WHERE c.org_id = ? AND c.type = 'time_off' AND c.status = 'pending'
       ORDER BY c.start_datetime ASC`,
    )
      .bind(membership.orgId)
      .all<ConstraintRow>()

    return { success: true, constraints: (rows.results ?? []).map(rowToView) }
  })

// ---------------------------------------------------------------------------
// createConstraintServerFn
// ---------------------------------------------------------------------------

export const createConstraintServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateConstraintInput) => d)
  .handler(async (ctx): Promise<CreateConstraintOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    let targetStaffId: string

    if (data.staffMemberId) {
      if (!canDo(membership.role, 'create-edit-schedules')) {
        return { success: false, error: 'FORBIDDEN' }
      }
      type StaffRow = { id: string }
      const staffRow = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
      )
        .bind(data.staffMemberId, membership.orgId)
        .first<StaffRow>()
      if (!staffRow) return { success: false, error: 'NOT_FOUND' }
      targetStaffId = staffRow.id
    } else {
      if (!canDo(membership.role, 'submit-time-off')) {
        return { success: false, error: 'FORBIDDEN' }
      }
      const selfId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
      if (!selfId) return { success: false, error: 'NO_STAFF_RECORD' }
      targetStaffId = selfId
    }

    if (!validateDatetimes(data.startDatetime, data.endDatetime)) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    if (data.daysOfWeek && !validateDaysOfWeek(data.daysOfWeek)) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const status = data.type === 'time_off' ? 'pending' : 'approved'
    const daysOfWeekJson = data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null

    await env.DB.prepare(
      `INSERT INTO staff_constraint
         (id, org_id, staff_member_id, created_by, type, status,
          start_datetime, end_datetime, days_of_week, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id, membership.orgId, targetStaffId, membership.userId,
        data.type, status,
        data.startDatetime, data.endDatetime,
        daysOfWeekJson, data.reason ?? null,
        now, now,
      )
      .run()

    const row = await env.DB.prepare(`${CONSTRAINT_SELECT} WHERE c.id = ?`)
      .bind(id)
      .first<ConstraintRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, constraint: rowToView(row) }
  })

// ---------------------------------------------------------------------------
// updateConstraintServerFn
// ---------------------------------------------------------------------------

export const updateConstraintServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateConstraintInput) => d)
  .handler(async (ctx): Promise<UpdateConstraintOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type ConstraintMeta = {
      staff_member_id: string
      type: string
      status: string
      start_datetime: string
      end_datetime: string
    }
    const existing = await env.DB.prepare(
      `SELECT staff_member_id, type, status, start_datetime, end_datetime
       FROM staff_constraint WHERE id = ? AND org_id = ?`,
    )
      .bind(data.constraintId, membership.orgId)
      .first<ConstraintMeta>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const selfStaffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    const isOwn = selfStaffId === existing.staff_member_id
    if (!isOwn && !canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    if (existing.type === 'time_off' && existing.status !== 'pending') {
      return { success: false, error: 'CONSTRAINT_REVIEWED' }
    }

    const newStart = data.startDatetime ?? existing.start_datetime
    const newEnd = data.endDatetime ?? existing.end_datetime

    if (!validateDatetimes(newStart, newEnd)) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    if (data.daysOfWeek != null && !validateDaysOfWeek(data.daysOfWeek)) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const now = new Date().toISOString()

    // Build dynamic SET clause
    const sets: string[] = ['updated_at = ?']
    const vals: (string | null)[] = [now]

    if (data.startDatetime !== undefined) { sets.push('start_datetime = ?'); vals.push(data.startDatetime) }
    if (data.endDatetime !== undefined) { sets.push('end_datetime = ?'); vals.push(data.endDatetime) }
    if ('daysOfWeek' in data) {
      sets.push('days_of_week = ?')
      vals.push(data.daysOfWeek != null ? JSON.stringify(data.daysOfWeek) : null)
    }
    if ('reason' in data) { sets.push('reason = ?'); vals.push(data.reason ?? null) }

    // D1 doesn't support spread — build a statement with exact arity
    const sql = `UPDATE staff_constraint SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`
    let stmt = env.DB.prepare(sql)
    for (const v of [...vals, data.constraintId, membership.orgId]) {
      stmt = stmt.bind(v)
    }
    await stmt.run()

    const row = await env.DB.prepare(`${CONSTRAINT_SELECT} WHERE c.id = ?`)
      .bind(data.constraintId)
      .first<ConstraintRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, constraint: rowToView(row) }
  })

// ---------------------------------------------------------------------------
// deleteConstraintServerFn
// ---------------------------------------------------------------------------

export const deleteConstraintServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteConstraintInput) => d)
  .handler(async (ctx): Promise<DeleteConstraintOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type ConstraintMeta = { staff_member_id: string }
    const existing = await env.DB.prepare(
      `SELECT staff_member_id FROM staff_constraint WHERE id = ? AND org_id = ?`,
    )
      .bind(data.constraintId, membership.orgId)
      .first<ConstraintMeta>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const selfStaffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    const isOwn = selfStaffId === existing.staff_member_id
    if (!isOwn && !canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    await env.DB.prepare(`DELETE FROM staff_constraint WHERE id = ? AND org_id = ?`)
      .bind(data.constraintId, membership.orgId)
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// reviewConstraintServerFn
// ---------------------------------------------------------------------------

export const reviewConstraintServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ReviewConstraintInput) => d)
  .handler(async (ctx): Promise<ReviewConstraintOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'approve-time-off')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type ConstraintMeta = { type: string; status: string }
    const existing = await env.DB.prepare(
      `SELECT type, status FROM staff_constraint WHERE id = ? AND org_id = ?`,
    )
      .bind(data.constraintId, membership.orgId)
      .first<ConstraintMeta>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }
    if (existing.type !== 'time_off') return { success: false, error: 'WRONG_TYPE' }
    if (existing.status !== 'pending') return { success: false, error: 'ALREADY_REVIEWED' }

    const now = new Date().toISOString()

    await env.DB.prepare(
      `UPDATE staff_constraint
       SET status = ?, reviewer_id = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND org_id = ?`,
    )
      .bind(data.decision, membership.userId, now, now, data.constraintId, membership.orgId)
      .run()

    const row = await env.DB.prepare(`${CONSTRAINT_SELECT} WHERE c.id = ?`)
      .bind(data.constraintId)
      .first<ConstraintRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, constraint: rowToView(row) }
  })
