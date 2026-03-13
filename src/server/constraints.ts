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
import { getOrgStub } from '@/server/_do-helpers'

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function resolveStaffMemberId(
  env: Cloudflare.Env,
  orgId: string,
  userId: string,
): Promise<string | null> {
  type Row = { id: string }
  const stub = getOrgStub(env, orgId)
  const row = await stub.queryOne(
    `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed'`,
    userId,
  ) as Row | null
  return row?.id ?? null
}

type DOConstraintRow = {
  id: string
  staff_member_id: string
  staff_member_name: string
  reviewer_id: string | null
  type: string
  status: string
  start_datetime: string
  end_datetime: string
  days_of_week: string | null
  reason: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

function rowToView(r: DOConstraintRow, reviewerName: string | null): ConstraintView {
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
    reviewerName,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const DO_CONSTRAINT_SELECT = `
  SELECT
    c.id, c.staff_member_id, sm.name AS staff_member_name,
    c.type, c.status, c.start_datetime, c.end_datetime,
    c.days_of_week, c.reason, c.reviewer_id, c.reviewed_at,
    c.created_at, c.updated_at
  FROM staff_constraint c
  JOIN staff_member sm ON sm.id = c.staff_member_id
`

/**
 * Batch-resolve reviewer display names from D1 user_profile for a set of DO constraint rows.
 */
async function enrichReviewerNames(
  env: Cloudflare.Env,
  rows: DOConstraintRow[],
): Promise<Map<string, string>> {
  const reviewerIds = [...new Set(rows.map((r) => r.reviewer_id).filter((id): id is string => id != null))]
  const nameMap = new Map<string, string>()
  if (reviewerIds.length === 0) return nameMap

  const placeholders = reviewerIds.map(() => '?').join(', ')
  type ProfileRow = { user_id: string; display_name: string }
  const result = await env.DB.prepare(
    `SELECT user_id, display_name FROM user_profile WHERE user_id IN (${placeholders})`,
  )
    .bind(...reviewerIds)
    .all<ProfileRow>()
  for (const row of result.results ?? []) {
    nameMap.set(row.user_id, row.display_name)
  }
  return nameMap
}

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

    const stub = getOrgStub(env, membership.orgId)
    const rows = await stub.query(
      `${DO_CONSTRAINT_SELECT}
       WHERE c.staff_member_id = ?
       ORDER BY c.start_datetime ASC`,
      targetStaffId,
    ) as DOConstraintRow[]

    const reviewerNames = await enrichReviewerNames(env, rows)
    return { success: true, constraints: rows.map((r) => rowToView(r, reviewerNames.get(r.reviewer_id ?? '') ?? null)) }
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

    const stub = getOrgStub(env, membership.orgId)
    const rows = await stub.query(
      `${DO_CONSTRAINT_SELECT}
       WHERE c.type = 'time_off' AND c.status = 'pending'
       ORDER BY c.start_datetime ASC`,
    ) as DOConstraintRow[]

    const reviewerNames = await enrichReviewerNames(env, rows)
    return { success: true, constraints: rows.map((r) => rowToView(r, reviewerNames.get(r.reviewer_id ?? '') ?? null)) }
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

    const stub = getOrgStub(env, membership.orgId)
    let targetStaffId: string

    if (data.staffMemberId) {
      if (!canDo(membership.role, 'create-edit-schedules')) {
        return { success: false, error: 'FORBIDDEN' }
      }
      type StaffRow = { id: string }
      const staffRow = await stub.queryOne(
        `SELECT id FROM staff_member WHERE id = ? AND status != 'removed'`,
        data.staffMemberId,
      ) as StaffRow | null
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

    await stub.execute(
      `INSERT INTO staff_constraint
         (id, staff_member_id, created_by, type, status,
          start_datetime, end_datetime, days_of_week, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, targetStaffId, membership.userId,
      data.type, status,
      data.startDatetime, data.endDatetime,
      daysOfWeekJson, data.reason ?? null,
      now, now,
    )

    const row = await stub.queryOne(
      `${DO_CONSTRAINT_SELECT} WHERE c.id = ?`,
      id,
    ) as DOConstraintRow | null

    if (!row) return { success: false, error: 'NOT_FOUND' }
    const reviewerNames = await enrichReviewerNames(env, [row])
    return { success: true, constraint: rowToView(row, reviewerNames.get(row.reviewer_id ?? '') ?? null) }
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

    const stub = getOrgStub(env, membership.orgId)

    type ConstraintMeta = {
      staff_member_id: string
      type: string
      status: string
      start_datetime: string
      end_datetime: string
    }
    const existing = await stub.queryOne(
      `SELECT staff_member_id, type, status, start_datetime, end_datetime
       FROM staff_constraint WHERE id = ?`,
      data.constraintId,
    ) as ConstraintMeta | null

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

    const doSql = `UPDATE staff_constraint SET ${sets.join(', ')} WHERE id = ?`
    await stub.execute(doSql, ...vals, data.constraintId)

    const row = await stub.queryOne(
      `${DO_CONSTRAINT_SELECT} WHERE c.id = ?`,
      data.constraintId,
    ) as DOConstraintRow | null

    if (!row) return { success: false, error: 'NOT_FOUND' }
    const reviewerNames = await enrichReviewerNames(env, [row])
    return { success: true, constraint: rowToView(row, reviewerNames.get(row.reviewer_id ?? '') ?? null) }
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

    const stub = getOrgStub(env, membership.orgId)

    type ConstraintMeta = { staff_member_id: string }
    const existing = await stub.queryOne(
      `SELECT staff_member_id FROM staff_constraint WHERE id = ?`,
      data.constraintId,
    ) as ConstraintMeta | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const selfStaffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    const isOwn = selfStaffId === existing.staff_member_id
    if (!isOwn && !canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    await stub.execute(
      `DELETE FROM staff_constraint WHERE id = ?`,
      data.constraintId,
    )

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

    const stub = getOrgStub(env, membership.orgId)

    type ConstraintMeta = { type: string; status: string }
    const existing = await stub.queryOne(
      `SELECT type, status FROM staff_constraint WHERE id = ?`,
      data.constraintId,
    ) as ConstraintMeta | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }
    if (existing.type !== 'time_off') return { success: false, error: 'WRONG_TYPE' }
    if (existing.status !== 'pending') return { success: false, error: 'ALREADY_REVIEWED' }

    const now = new Date().toISOString()

    await stub.execute(
      `UPDATE staff_constraint
       SET status = ?, reviewer_id = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      data.decision, membership.userId, now, now, data.constraintId,
    )

    const row = await stub.queryOne(
      `${DO_CONSTRAINT_SELECT} WHERE c.id = ?`,
      data.constraintId,
    ) as DOConstraintRow | null

    if (!row) return { success: false, error: 'NOT_FOUND' }
    const reviewerNames = await enrichReviewerNames(env, [row])
    return { success: true, constraint: rowToView(row, reviewerNames.get(row.reviewer_id ?? '') ?? null) }
  })
