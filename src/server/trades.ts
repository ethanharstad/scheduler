import { createServerFn } from '@tanstack/react-start'
import { canDo } from '@/lib/rbac'
import { requireOrgMembership } from '@/server/_helpers'
import { getOrgStub } from '@/server/_do-helpers'
import { checkSingleStaffEligibility } from '@/server/qualifications'
import type {
  ShiftTradeView,
  CreateTradeInput,
  AcceptTradeInput,
  ReviewTradeInput,
  TradeActionInput,
  ListTradesInput,
  GetTradeInput,
  TradeStatus,
} from '@/lib/trade.types'
import type { EligibilityWarning } from '@/lib/qualifications.types'

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
  const row = (await stub.queryOne(
    `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed'`,
    userId,
  )) as Row | null
  return row?.id ?? null
}

type DOTradeRow = {
  id: string
  offering_assignment_id: string
  offering_staff_id: string
  offering_staff_name: string
  offering_schedule_id: string
  offering_schedule_name: string
  offering_start_datetime: string
  offering_end_datetime: string
  offering_position: string | null
  offering_position_id: string | null
  offering_assign_start: string
  offering_assign_end: string
  receiving_assignment_id: string | null
  receiving_staff_id: string | null
  receiving_staff_name: string | null
  receiving_schedule_id: string | null
  receiving_schedule_name: string | null
  receiving_start_datetime: string | null
  receiving_end_datetime: string | null
  receiving_position: string | null
  receiving_position_id: string | null
  receiving_assign_start: string | null
  receiving_assign_end: string | null
  trade_type: string
  status: string
  is_open_board: number
  reason: string | null
  denial_reason: string | null
  accepted_by: string | null
  accepted_at: string | null
  reviewer_id: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

const DO_TRADE_SELECT = `
  SELECT
    t.id, t.offering_assignment_id, t.offering_staff_id,
    osm.name AS offering_staff_name,
    t.offering_schedule_id, os.name AS offering_schedule_name,
    t.offering_start_datetime, t.offering_end_datetime,
    oa.position AS offering_position, oa.position_id AS offering_position_id,
    oa.start_datetime AS offering_assign_start, oa.end_datetime AS offering_assign_end,
    t.receiving_assignment_id, t.receiving_staff_id,
    rsm.name AS receiving_staff_name,
    t.receiving_schedule_id, rs.name AS receiving_schedule_name,
    t.receiving_start_datetime, t.receiving_end_datetime,
    ra.position AS receiving_position, ra.position_id AS receiving_position_id,
    ra.start_datetime AS receiving_assign_start, ra.end_datetime AS receiving_assign_end,
    t.trade_type, t.status, t.is_open_board,
    t.reason, t.denial_reason,
    t.accepted_by, t.accepted_at,
    t.reviewer_id, t.reviewed_at,
    t.created_at, t.updated_at, t.expires_at
  FROM shift_trade t
  JOIN staff_member osm ON osm.id = t.offering_staff_id
  JOIN schedule os ON os.id = t.offering_schedule_id
  JOIN shift_assignment oa ON oa.id = t.offering_assignment_id
  LEFT JOIN staff_member rsm ON rsm.id = t.receiving_staff_id
  LEFT JOIN schedule rs ON rs.id = t.receiving_schedule_id
  LEFT JOIN shift_assignment ra ON ra.id = t.receiving_assignment_id
`

function rowToView(r: DOTradeRow, reviewerName: string | null): ShiftTradeView {
  return {
    id: r.id,
    tradeType: r.trade_type as ShiftTradeView['tradeType'],
    status: r.status as TradeStatus,
    isOpenBoard: r.is_open_board === 1,
    reason: r.reason,
    denialReason: r.denial_reason,
    offeringStaffId: r.offering_staff_id,
    offeringStaffName: r.offering_staff_name,
    offeringAssignmentId: r.offering_assignment_id,
    offeringScheduleId: r.offering_schedule_id,
    offeringScheduleName: r.offering_schedule_name,
    offeringStartDatetime: r.offering_start_datetime,
    offeringEndDatetime: r.offering_end_datetime,
    offeringPosition: r.offering_position,
    offeringPositionId: r.offering_position_id,
    offeringIsPartial:
      r.offering_start_datetime !== r.offering_assign_start ||
      r.offering_end_datetime !== r.offering_assign_end,
    receivingStaffId: r.receiving_staff_id,
    receivingStaffName: r.receiving_staff_name,
    receivingAssignmentId: r.receiving_assignment_id,
    receivingScheduleId: r.receiving_schedule_id,
    receivingScheduleName: r.receiving_schedule_name,
    receivingStartDatetime: r.receiving_start_datetime,
    receivingEndDatetime: r.receiving_end_datetime,
    receivingPosition: r.receiving_position,
    receivingPositionId: r.receiving_position_id,
    receivingIsPartial:
      r.receiving_start_datetime != null &&
      r.receiving_assign_start != null &&
      (r.receiving_start_datetime !== r.receiving_assign_start ||
        r.receiving_end_datetime !== r.receiving_assign_end),
    reviewerName,
    reviewedAt: r.reviewed_at,
    acceptedAt: r.accepted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at,
  }
}

async function enrichReviewerNames(
  env: Cloudflare.Env,
  rows: DOTradeRow[],
): Promise<Map<string, string>> {
  const reviewerIds = [
    ...new Set(rows.map((r) => r.reviewer_id).filter((id): id is string => id != null)),
  ]
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

const ACTIVE_STATUSES = `('pending_acceptance', 'pending_approval')`

/** Expire trades whose offering shift has already started */
async function expireStaleTradesLazy(
  stub: ReturnType<typeof getOrgStub>,
): Promise<void> {
  const now = new Date().toISOString()
  await stub.execute(
    `UPDATE shift_trade SET status = 'expired', updated_at = ?
     WHERE status IN ${ACTIVE_STATUSES}
       AND offering_start_datetime <= ?`,
    now,
    now,
  )
}

// ---------------------------------------------------------------------------
// listTradesServerFn — list current user's trades
// ---------------------------------------------------------------------------

type ListTradesOutput =
  | { success: true; trades: ShiftTradeView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NO_STAFF_RECORD' }

export const listTradesServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListTradesInput) => d)
  .handler(async (ctx): Promise<ListTradesOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'view-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const staffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    if (!staffId) return { success: false, error: 'NO_STAFF_RECORD' }

    const stub = getOrgStub(env, membership.orgId)
    await expireStaleTradesLazy(stub)

    let query = `${DO_TRADE_SELECT}
      WHERE (t.offering_staff_id = ? OR t.receiving_staff_id = ?)`
    const params: string[] = [staffId, staffId]

    if (data.status) {
      query += ` AND t.status = ?`
      params.push(data.status)
    }

    query += ` ORDER BY t.created_at DESC`

    const rows = (await stub.query(query, ...params)) as DOTradeRow[]
    const reviewerNames = await enrichReviewerNames(env, rows)
    return {
      success: true,
      trades: rows.map((r) => rowToView(r, reviewerNames.get(r.reviewer_id ?? '') ?? null)),
    }
  })

// ---------------------------------------------------------------------------
// listOpenBoardTradesServerFn
// ---------------------------------------------------------------------------

type ListOpenBoardOutput =
  | { success: true; trades: ShiftTradeView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' }

export const listOpenBoardTradesServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListTradesInput) => d)
  .handler(async (ctx): Promise<ListOpenBoardOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'view-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)
    await expireStaleTradesLazy(stub)

    const rows = (await stub.query(
      `${DO_TRADE_SELECT}
       WHERE t.is_open_board = 1 AND t.status = 'pending_acceptance'
       ORDER BY t.offering_start_datetime ASC`,
    )) as DOTradeRow[]

    return {
      success: true,
      trades: rows.map((r) => rowToView(r, null)),
    }
  })

// ---------------------------------------------------------------------------
// listPendingTradeApprovalsServerFn
// ---------------------------------------------------------------------------

type ListApprovalsOutput =
  | { success: true; trades: ShiftTradeView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' }

export const listPendingTradeApprovalsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListTradesInput) => d)
  .handler(async (ctx): Promise<ListApprovalsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'approve-trade')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)
    await expireStaleTradesLazy(stub)

    const rows = (await stub.query(
      `${DO_TRADE_SELECT}
       WHERE t.status = 'pending_approval'
       ORDER BY t.created_at ASC`,
    )) as DOTradeRow[]

    const reviewerNames = await enrichReviewerNames(env, rows)
    return {
      success: true,
      trades: rows.map((r) => rowToView(r, reviewerNames.get(r.reviewer_id ?? '') ?? null)),
    }
  })

// ---------------------------------------------------------------------------
// getTradeServerFn
// ---------------------------------------------------------------------------

type GetTradeOutput =
  | { success: true; trade: ShiftTradeView; eligibilityWarnings: EligibilityWarning[] }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export const getTradeServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetTradeInput) => d)
  .handler(async (ctx): Promise<GetTradeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'view-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    const row = (await stub.queryOne(
      `${DO_TRADE_SELECT} WHERE t.id = ?`,
      data.tradeId,
    )) as DOTradeRow | null

    if (!row) return { success: false, error: 'NOT_FOUND' }

    const reviewerNames = await enrichReviewerNames(env, [row])
    const trade = rowToView(row, reviewerNames.get(row.reviewer_id ?? '') ?? null)

    // Eligibility warnings for both parties
    const warnings: EligibilityWarning[] = []
    if (trade.receivingStaffId && trade.offeringPositionId) {
      const w = await checkSingleStaffEligibility(
        env,
        membership.orgId,
        trade.receivingStaffId,
        trade.offeringPositionId,
        trade.offeringStartDatetime.slice(0, 10),
      )
      warnings.push(...w)
    }
    if (trade.tradeType === 'swap' && trade.receivingPositionId && trade.offeringStaffId) {
      const w = await checkSingleStaffEligibility(
        env,
        membership.orgId,
        trade.offeringStaffId,
        trade.receivingPositionId,
        (trade.receivingStartDatetime ?? trade.offeringStartDatetime).slice(0, 10),
      )
      warnings.push(...w)
    }

    return { success: true, trade, eligibilityWarnings: warnings }
  })

// ---------------------------------------------------------------------------
// createTradeServerFn
// ---------------------------------------------------------------------------

type CreateTradeOutput =
  | { success: true; trade: ShiftTradeView }
  | {
      success: false
      error:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'NO_STAFF_RECORD'
        | 'VALIDATION_ERROR'
        | 'DRAFT_SCHEDULE'
        | 'SHIFT_STARTED'
        | 'DUPLICATE_TRADE'
    }

export const createTradeServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateTradeInput) => d)
  .handler(async (ctx): Promise<CreateTradeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'submit-trade')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const selfStaffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    if (!selfStaffId) return { success: false, error: 'NO_STAFF_RECORD' }

    const stub = getOrgStub(env, membership.orgId)

    // Verify offering assignment exists and belongs to current user
    type AssignRow = {
      id: string
      schedule_id: string
      staff_member_id: string
      start_datetime: string
      end_datetime: string
      position: string | null
      position_id: string | null
    }
    const offering = (await stub.queryOne(
      `SELECT sa.id, sa.schedule_id, sa.staff_member_id, sa.start_datetime, sa.end_datetime,
              sa.position, sa.position_id
       FROM shift_assignment sa
       WHERE sa.id = ?`,
      data.offeringAssignmentId,
    )) as AssignRow | null

    if (!offering) return { success: false, error: 'NOT_FOUND' }
    if (offering.staff_member_id !== selfStaffId) {
      return { success: false, error: 'FORBIDDEN' }
    }

    // Verify schedule is published
    type ScheduleRow = { status: string }
    const schedule = (await stub.queryOne(
      `SELECT status FROM schedule WHERE id = ?`,
      offering.schedule_id,
    )) as ScheduleRow | null
    if (!schedule || schedule.status !== 'published') {
      return { success: false, error: 'DRAFT_SCHEDULE' }
    }

    // Determine trade time range (partial or full)
    const offeringStart = data.offeringStartDatetime ?? offering.start_datetime
    const offeringEnd = data.offeringEndDatetime ?? offering.end_datetime

    // Validate partial range is within assignment
    if (offeringStart < offering.start_datetime || offeringEnd > offering.end_datetime) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }
    if (offeringEnd <= offeringStart) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    // Shift must not have started
    const now = new Date().toISOString()
    if (offeringStart <= now) {
      return { success: false, error: 'SHIFT_STARTED' }
    }

    // Check for duplicate active trade on same assignment
    type DupRow = { id: string }
    const dup = (await stub.queryOne(
      `SELECT id FROM shift_trade
       WHERE offering_assignment_id = ?
         AND status IN ${ACTIVE_STATUSES}`,
      data.offeringAssignmentId,
    )) as DupRow | null
    if (dup) return { success: false, error: 'DUPLICATE_TRADE' }

    // Build receiving fields for directed trades
    let receivingStaffId: string | null = null
    let receivingAssignmentId: string | null = null
    let receivingScheduleId: string | null = null
    let receivingStart: string | null = null
    let receivingEnd: string | null = null

    if (!data.isOpenBoard && data.receivingStaffId) {
      receivingStaffId = data.receivingStaffId

      if (data.tradeType === 'swap' && data.receivingAssignmentId) {
        const recvAssign = (await stub.queryOne(
          `SELECT sa.id, sa.schedule_id, sa.staff_member_id, sa.start_datetime, sa.end_datetime
           FROM shift_assignment sa WHERE sa.id = ?`,
          data.receivingAssignmentId,
        )) as AssignRow | null
        if (!recvAssign || recvAssign.staff_member_id !== receivingStaffId) {
          return { success: false, error: 'NOT_FOUND' }
        }
        receivingAssignmentId = recvAssign.id
        receivingScheduleId = recvAssign.schedule_id
        receivingStart = data.receivingStartDatetime ?? recvAssign.start_datetime
        receivingEnd = data.receivingEndDatetime ?? recvAssign.end_datetime

        // Validate partial range
        if (receivingStart < recvAssign.start_datetime || receivingEnd > recvAssign.end_datetime) {
          return { success: false, error: 'VALIDATION_ERROR' }
        }
      }
    }

    const id = crypto.randomUUID()

    await stub.execute(
      `INSERT INTO shift_trade
         (id, offering_assignment_id, offering_staff_id, offering_schedule_id,
          offering_start_datetime, offering_end_datetime,
          receiving_assignment_id, receiving_staff_id, receiving_schedule_id,
          receiving_start_datetime, receiving_end_datetime,
          trade_type, status, is_open_board, reason,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_acceptance', ?, ?, ?, ?)`,
      id,
      offering.id,
      selfStaffId,
      offering.schedule_id,
      offeringStart,
      offeringEnd,
      receivingAssignmentId,
      receivingStaffId,
      receivingScheduleId,
      receivingStart,
      receivingEnd,
      data.tradeType,
      data.isOpenBoard ? 1 : 0,
      data.reason?.trim() || null,
      now,
      now,
    )

    // Audit log
    await stub.writeAuditLog({
      staffMemberId: selfStaffId,
      performedBy: membership.userId,
      action: 'trade_proposed',
      metadata: { tradeId: id, tradeType: data.tradeType, isOpenBoard: String(data.isOpenBoard) },
    })

    const row = (await stub.queryOne(
      `${DO_TRADE_SELECT} WHERE t.id = ?`,
      id,
    )) as DOTradeRow | null
    if (!row) return { success: false, error: 'NOT_FOUND' }

    return { success: true, trade: rowToView(row, null) }
  })

// ---------------------------------------------------------------------------
// acceptTradeServerFn
// ---------------------------------------------------------------------------

type AcceptTradeOutput =
  | { success: true; trade: ShiftTradeView }
  | {
      success: false
      error:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'NO_STAFF_RECORD'
        | 'INVALID_STATUS'
        | 'SELF_ACCEPT'
        | 'VALIDATION_ERROR'
    }

export const acceptTradeServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: AcceptTradeInput) => d)
  .handler(async (ctx): Promise<AcceptTradeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'submit-trade')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const selfStaffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    if (!selfStaffId) return { success: false, error: 'NO_STAFF_RECORD' }

    const stub = getOrgStub(env, membership.orgId)

    type TradeRow = {
      id: string
      status: string
      is_open_board: number
      offering_staff_id: string
      receiving_staff_id: string | null
      trade_type: string
    }
    const trade = (await stub.queryOne(
      `SELECT id, status, is_open_board, offering_staff_id, receiving_staff_id, trade_type
       FROM shift_trade WHERE id = ?`,
      data.tradeId,
    )) as TradeRow | null

    if (!trade) return { success: false, error: 'NOT_FOUND' }
    if (trade.status !== 'pending_acceptance') {
      return { success: false, error: 'INVALID_STATUS' }
    }
    if (trade.offering_staff_id === selfStaffId) {
      return { success: false, error: 'SELF_ACCEPT' }
    }

    // For directed trades, only the target can accept
    if (trade.is_open_board === 0 && trade.receiving_staff_id !== selfStaffId) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const now = new Date().toISOString()

    // For open board claims, set receiving fields
    if (trade.is_open_board === 1) {
      let receivingAssignmentId: string | null = null
      let receivingScheduleId: string | null = null
      let receivingStart: string | null = null
      let receivingEnd: string | null = null

      if (trade.trade_type === 'swap' && data.receivingAssignmentId) {
        type AssignRow = {
          id: string
          schedule_id: string
          staff_member_id: string
          start_datetime: string
          end_datetime: string
        }
        const recvAssign = (await stub.queryOne(
          `SELECT id, schedule_id, staff_member_id, start_datetime, end_datetime
           FROM shift_assignment WHERE id = ?`,
          data.receivingAssignmentId,
        )) as AssignRow | null
        if (!recvAssign || recvAssign.staff_member_id !== selfStaffId) {
          return { success: false, error: 'NOT_FOUND' }
        }
        receivingAssignmentId = recvAssign.id
        receivingScheduleId = recvAssign.schedule_id
        receivingStart = data.receivingStartDatetime ?? recvAssign.start_datetime
        receivingEnd = data.receivingEndDatetime ?? recvAssign.end_datetime
      } else if (trade.trade_type === 'swap') {
        return { success: false, error: 'VALIDATION_ERROR' }
      }

      await stub.execute(
        `UPDATE shift_trade
         SET status = 'pending_approval',
             receiving_staff_id = ?, receiving_assignment_id = ?,
             receiving_schedule_id = ?,
             receiving_start_datetime = ?, receiving_end_datetime = ?,
             accepted_by = ?, accepted_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending_acceptance'`,
        selfStaffId,
        receivingAssignmentId,
        receivingScheduleId,
        receivingStart,
        receivingEnd,
        selfStaffId,
        now,
        now,
        data.tradeId,
      )
    } else {
      // Directed trade — just move to pending_approval
      await stub.execute(
        `UPDATE shift_trade
         SET status = 'pending_approval', accepted_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending_acceptance'`,
        now,
        now,
        data.tradeId,
      )
    }

    // Audit log
    await stub.writeAuditLog({
      staffMemberId: selfStaffId,
      performedBy: membership.userId,
      action: 'trade_accepted',
      metadata: { tradeId: data.tradeId },
    })

    const row = (await stub.queryOne(
      `${DO_TRADE_SELECT} WHERE t.id = ?`,
      data.tradeId,
    )) as DOTradeRow | null
    if (!row) return { success: false, error: 'NOT_FOUND' }

    const reviewerNames = await enrichReviewerNames(env, [row])
    return {
      success: true,
      trade: rowToView(row, reviewerNames.get(row.reviewer_id ?? '') ?? null),
    }
  })

// ---------------------------------------------------------------------------
// declineTradeServerFn
// ---------------------------------------------------------------------------

type DeclineTradeOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_STAFF_RECORD' | 'INVALID_STATUS' }

export const declineTradeServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: TradeActionInput) => d)
  .handler(async (ctx): Promise<DeclineTradeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'submit-trade')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const selfStaffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    if (!selfStaffId) return { success: false, error: 'NO_STAFF_RECORD' }

    const stub = getOrgStub(env, membership.orgId)

    type TradeRow = { id: string; status: string; receiving_staff_id: string | null }
    const trade = (await stub.queryOne(
      `SELECT id, status, receiving_staff_id FROM shift_trade WHERE id = ?`,
      data.tradeId,
    )) as TradeRow | null

    if (!trade) return { success: false, error: 'NOT_FOUND' }
    if (trade.status !== 'pending_acceptance') return { success: false, error: 'INVALID_STATUS' }
    if (trade.receiving_staff_id !== selfStaffId) return { success: false, error: 'FORBIDDEN' }

    const now = new Date().toISOString()
    await stub.execute(
      `UPDATE shift_trade SET status = 'withdrawn', updated_at = ? WHERE id = ?`,
      now,
      data.tradeId,
    )

    return { success: true }
  })

// ---------------------------------------------------------------------------
// withdrawTradeServerFn
// ---------------------------------------------------------------------------

type WithdrawTradeOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_STAFF_RECORD' | 'INVALID_STATUS' }

export const withdrawTradeServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: TradeActionInput) => d)
  .handler(async (ctx): Promise<WithdrawTradeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'submit-trade')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const selfStaffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    if (!selfStaffId) return { success: false, error: 'NO_STAFF_RECORD' }

    const stub = getOrgStub(env, membership.orgId)

    type TradeRow = { id: string; status: string; offering_staff_id: string }
    const trade = (await stub.queryOne(
      `SELECT id, status, offering_staff_id FROM shift_trade WHERE id = ?`,
      data.tradeId,
    )) as TradeRow | null

    if (!trade) return { success: false, error: 'NOT_FOUND' }
    if (trade.offering_staff_id !== selfStaffId) return { success: false, error: 'FORBIDDEN' }
    if (trade.status !== 'pending_acceptance' && trade.status !== 'pending_approval') {
      return { success: false, error: 'INVALID_STATUS' }
    }

    const now = new Date().toISOString()
    await stub.execute(
      `UPDATE shift_trade SET status = 'withdrawn', updated_at = ? WHERE id = ?`,
      now,
      data.tradeId,
    )

    await stub.writeAuditLog({
      staffMemberId: selfStaffId,
      performedBy: membership.userId,
      action: 'trade_withdrawn',
      metadata: { tradeId: data.tradeId },
    })

    return { success: true }
  })

// ---------------------------------------------------------------------------
// reviewTradeServerFn — manager approve / deny
// ---------------------------------------------------------------------------

type ReviewTradeOutput =
  | { success: true; trade: ShiftTradeView }
  | {
      success: false
      error:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'INVALID_STATUS'
        | 'SELF_REVIEW'
        | 'ASSIGNMENT_MISSING'
    }

export const reviewTradeServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ReviewTradeInput) => d)
  .handler(async (ctx): Promise<ReviewTradeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'approve-trade')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type FullTradeRow = {
      id: string
      status: string
      offering_staff_id: string
      offering_assignment_id: string
      offering_start_datetime: string
      offering_end_datetime: string
      receiving_staff_id: string | null
      receiving_assignment_id: string | null
      receiving_start_datetime: string | null
      receiving_end_datetime: string | null
      trade_type: string
    }
    const trade = (await stub.queryOne(
      `SELECT t.id, t.status, t.offering_staff_id, t.offering_assignment_id,
              t.offering_start_datetime, t.offering_end_datetime,
              t.receiving_staff_id, t.receiving_assignment_id,
              t.receiving_start_datetime, t.receiving_end_datetime,
              t.trade_type
       FROM shift_trade t WHERE t.id = ?`,
      data.tradeId,
    )) as FullTradeRow | null

    if (!trade) return { success: false, error: 'NOT_FOUND' }
    if (trade.status !== 'pending_approval') return { success: false, error: 'INVALID_STATUS' }

    // Self-review prevention: manager cannot approve own trade
    const selfStaffId = await resolveStaffMemberId(env, membership.orgId, membership.userId)
    if (
      selfStaffId === trade.offering_staff_id ||
      selfStaffId === trade.receiving_staff_id
    ) {
      return { success: false, error: 'SELF_REVIEW' }
    }

    const now = new Date().toISOString()

    if (data.decision === 'denied') {
      await stub.execute(
        `UPDATE shift_trade
         SET status = 'denied', reviewer_id = ?, reviewed_at = ?,
             denial_reason = ?, updated_at = ?
         WHERE id = ?`,
        membership.userId,
        now,
        data.reason?.trim() || null,
        now,
        data.tradeId,
      )

      await stub.writeAuditLog({
        staffMemberId: trade.offering_staff_id,
        performedBy: membership.userId,
        action: 'trade_denied',
        metadata: { tradeId: data.tradeId },
      })
    } else {
      // APPROVE — mutate shift assignments
      if (!trade.receiving_staff_id) {
        return { success: false, error: 'ASSIGNMENT_MISSING' }
      }

      // Verify both assignments still exist
      type AssignCheck = { id: string; staff_member_id: string; start_datetime: string; end_datetime: string; position: string | null; position_id: string | null; notes: string | null }
      const offeringAssign = (await stub.queryOne(
        `SELECT id, staff_member_id, start_datetime, end_datetime, position, position_id, notes FROM shift_assignment WHERE id = ?`,
        trade.offering_assignment_id,
      )) as AssignCheck | null
      if (!offeringAssign) return { success: false, error: 'ASSIGNMENT_MISSING' }

      // Execute the trade: handle partial or full
      const isOfferingPartial =
        trade.offering_start_datetime !== offeringAssign.start_datetime ||
        trade.offering_end_datetime !== offeringAssign.end_datetime

      if (trade.trade_type === 'swap' && trade.receiving_assignment_id) {
        const receivingAssign = (await stub.queryOne(
          `SELECT id, staff_member_id, start_datetime, end_datetime, position, position_id, notes FROM shift_assignment WHERE id = ?`,
          trade.receiving_assignment_id,
        )) as AssignCheck | null
        if (!receivingAssign) return { success: false, error: 'ASSIGNMENT_MISSING' }

        const isReceivingPartial =
          trade.receiving_start_datetime != null &&
          (trade.receiving_start_datetime !== receivingAssign.start_datetime ||
            trade.receiving_end_datetime !== receivingAssign.end_datetime)

        // Handle offering side
        if (isOfferingPartial) {
          await splitAssignmentForTrade(stub, offeringAssign, trade.offering_start_datetime, trade.offering_end_datetime, trade.receiving_staff_id, now)
        } else {
          await stub.execute(
            `UPDATE shift_assignment SET staff_member_id = ?, updated_at = ? WHERE id = ?`,
            trade.receiving_staff_id,
            now,
            trade.offering_assignment_id,
          )
        }

        // Handle receiving side
        if (isReceivingPartial && trade.receiving_start_datetime && trade.receiving_end_datetime) {
          await splitAssignmentForTrade(stub, receivingAssign, trade.receiving_start_datetime, trade.receiving_end_datetime, trade.offering_staff_id, now)
        } else {
          await stub.execute(
            `UPDATE shift_assignment SET staff_member_id = ?, updated_at = ? WHERE id = ?`,
            trade.offering_staff_id,
            now,
            trade.receiving_assignment_id,
          )
        }
      } else {
        // Giveaway — assign offered shift to receiver
        if (isOfferingPartial) {
          await splitAssignmentForTrade(stub, offeringAssign, trade.offering_start_datetime, trade.offering_end_datetime, trade.receiving_staff_id, now)
        } else {
          await stub.execute(
            `UPDATE shift_assignment SET staff_member_id = ?, updated_at = ? WHERE id = ?`,
            trade.receiving_staff_id,
            now,
            trade.offering_assignment_id,
          )
        }
      }

      await stub.execute(
        `UPDATE shift_trade
         SET status = 'approved', reviewer_id = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ?`,
        membership.userId,
        now,
        now,
        data.tradeId,
      )

      // Audit logs for both parties
      await stub.writeAuditLog({
        staffMemberId: trade.offering_staff_id,
        performedBy: membership.userId,
        action: 'trade_approved',
        metadata: { tradeId: data.tradeId, tradeType: trade.trade_type },
      })
      if (trade.receiving_staff_id) {
        await stub.writeAuditLog({
          staffMemberId: trade.receiving_staff_id,
          performedBy: membership.userId,
          action: 'trade_approved',
          metadata: { tradeId: data.tradeId, tradeType: trade.trade_type },
        })
      }
    }

    const row = (await stub.queryOne(
      `${DO_TRADE_SELECT} WHERE t.id = ?`,
      data.tradeId,
    )) as DOTradeRow | null
    if (!row) return { success: false, error: 'NOT_FOUND' }

    const reviewerNames = await enrichReviewerNames(env, [row])
    return {
      success: true,
      trade: rowToView(row, reviewerNames.get(row.reviewer_id ?? '') ?? null),
    }
  })

// ---------------------------------------------------------------------------
// Partial trade helper: split an assignment
// ---------------------------------------------------------------------------

type AssignInfo = {
  id: string
  staff_member_id: string
  start_datetime: string
  end_datetime: string
  position: string | null
  position_id: string | null
  notes: string | null
}

/**
 * Split a shift_assignment to carve out a traded time range.
 * The traded portion is assigned to newStaffId.
 * The original assignment is modified to keep the remaining time.
 * If the trade cuts the middle, two remainder pieces are created + original deleted.
 */
async function splitAssignmentForTrade(
  stub: ReturnType<typeof getOrgStub>,
  assignment: AssignInfo,
  tradeStart: string,
  tradeEnd: string,
  newStaffId: string,
  now: string,
): Promise<void> {
  const beforeTrade = assignment.start_datetime < tradeStart
  const afterTrade = assignment.end_datetime > tradeEnd

  // Create the traded portion assignment for the new staff member
  const tradedId = crypto.randomUUID()
  await stub.execute(
    `INSERT INTO shift_assignment (id, schedule_id, staff_member_id, start_datetime, end_datetime, position, position_id, notes, created_at, updated_at)
     SELECT ?, schedule_id, ?, ?, ?, position, position_id, notes, ?, ?
     FROM shift_assignment WHERE id = ?`,
    tradedId,
    newStaffId,
    tradeStart,
    tradeEnd,
    now,
    now,
    assignment.id,
  )

  if (beforeTrade && afterTrade) {
    // Middle cut: original keeps the "before" portion, create new for "after"
    await stub.execute(
      `UPDATE shift_assignment SET end_datetime = ?, updated_at = ? WHERE id = ?`,
      tradeStart,
      now,
      assignment.id,
    )
    const afterId = crypto.randomUUID()
    await stub.execute(
      `INSERT INTO shift_assignment (id, schedule_id, staff_member_id, start_datetime, end_datetime, position, position_id, notes, created_at, updated_at)
       SELECT ?, schedule_id, staff_member_id, ?, ?, position, position_id, notes, ?, ?
       FROM shift_assignment WHERE id = ?`,
      afterId,
      tradeEnd,
      assignment.end_datetime,
      now,
      now,
      assignment.id,
    )
  } else if (beforeTrade) {
    // Trading the end portion: shorten original
    await stub.execute(
      `UPDATE shift_assignment SET end_datetime = ?, updated_at = ? WHERE id = ?`,
      tradeStart,
      now,
      assignment.id,
    )
  } else if (afterTrade) {
    // Trading the start portion: move original start forward
    await stub.execute(
      `UPDATE shift_assignment SET start_datetime = ?, updated_at = ? WHERE id = ?`,
      tradeEnd,
      now,
      assignment.id,
    )
  } else {
    // Full assignment traded — just reassign
    await stub.execute(
      `UPDATE shift_assignment SET staff_member_id = ?, updated_at = ? WHERE id = ?`,
      newStaffId,
      now,
      assignment.id,
    )
    // Delete the duplicate we created above since we're doing a full swap
    await stub.execute(`DELETE FROM shift_assignment WHERE id = ?`, tradedId)
  }
}

// ---------------------------------------------------------------------------
// cancelActiveTradesForAssignment — used by schedule/staff deletion
// ---------------------------------------------------------------------------

export async function cancelActiveTradesForAssignment(
  stub: ReturnType<typeof getOrgStub>,
  assignmentId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await stub.execute(
    `UPDATE shift_trade SET status = 'cancelled_system', updated_at = ?
     WHERE (offering_assignment_id = ? OR receiving_assignment_id = ?)
       AND status IN ${ACTIVE_STATUSES}`,
    now,
    assignmentId,
    assignmentId,
  )
}

export async function cancelActiveTradesForSchedule(
  stub: ReturnType<typeof getOrgStub>,
  scheduleId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await stub.execute(
    `UPDATE shift_trade SET status = 'cancelled_system', updated_at = ?
     WHERE offering_schedule_id = ?
       AND status IN ${ACTIVE_STATUSES}`,
    now,
    scheduleId,
  )
}

export async function cancelActiveTradesForStaffMember(
  stub: ReturnType<typeof getOrgStub>,
  staffMemberId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await stub.execute(
    `UPDATE shift_trade SET status = 'cancelled_system', updated_at = ?
     WHERE (offering_staff_id = ? OR receiving_staff_id = ?)
       AND status IN ${ACTIVE_STATUSES}`,
    now,
    staffMemberId,
    staffMemberId,
  )
}
