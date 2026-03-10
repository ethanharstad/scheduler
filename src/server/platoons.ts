import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { canDo } from '@/lib/rbac'
import type { OrgRole } from '@/lib/org.types'
import type {
  ListPlatoonsInput,
  ListPlatoonsOutput,
  GetPlatoonInput,
  GetPlatoonOutput,
  CreatePlatoonInput,
  CreatePlatoonOutput,
  UpdatePlatoonInput,
  UpdatePlatoonOutput,
  DeletePlatoonInput,
  DeletePlatoonOutput,
  AssignMemberInput,
  AssignMemberOutput,
  RemoveMemberFromPlatoonInput,
  RemoveMemberFromPlatoonOutput,
  GetStaffPlatoonInput,
  GetStaffPlatoonOutput,
  PlatoonView,
  PlatoonMemberView,
  StaffOption,
  PositionOption,
  RRuleEntry,
} from '@/lib/platoon.types'

// ---------------------------------------------------------------------------
// Internal helper: resolve session + org membership in one call
// ---------------------------------------------------------------------------

type MembershipContext = {
  userId: string
  membershipId: string
  orgId: string
  role: OrgRole
  isSystemAdmin: boolean
}

async function requireOrgMembership(
  env: Cloudflare.Env,
  orgSlug: string,
): Promise<MembershipContext | null> {
  const sessionToken = getCookie('session')
  if (!sessionToken) return null

  const now = new Date().toISOString()

  type SessionRow = { user_id: string; is_system_admin: number }
  const sessionRow = await env.DB.prepare(
    `SELECT s.user_id, u.is_system_admin
     FROM session s
     JOIN user u ON u.id = s.user_id
     WHERE s.session_token = ? AND s.expires_at > ?`,
  )
    .bind(sessionToken, now)
    .first<SessionRow>()
  if (!sessionRow) return null

  type OrgRow = { id: string }
  const orgRow = await env.DB.prepare(
    `SELECT id FROM organization WHERE slug = ? AND status = 'active'`,
  )
    .bind(orgSlug)
    .first<OrgRow>()
  if (!orgRow) return null

  type MemberRow = { membership_id: string; org_id: string; role: string }
  const memberRow = await env.DB.prepare(
    `SELECT m.id AS membership_id, m.org_id, m.role
     FROM org_membership m
     WHERE m.org_id = ? AND m.user_id = ? AND m.status = 'active'`,
  )
    .bind(orgRow.id, sessionRow.user_id)
    .first<MemberRow>()

  if (!memberRow && sessionRow.is_system_admin !== 1) return null

  if (!memberRow) {
    return {
      userId: sessionRow.user_id,
      membershipId: 'system-admin',
      orgId: orgRow.id,
      role: 'owner' as OrgRole,
      isSystemAdmin: true,
    }
  }

  return {
    userId: sessionRow.user_id,
    membershipId: memberRow.membership_id,
    orgId: memberRow.org_id,
    role: memberRow.role as OrgRole,
    isSystemAdmin: sessionRow.is_system_admin === 1,
  }
}

// ---------------------------------------------------------------------------
// Internal helper: HH:MM time validation
// ---------------------------------------------------------------------------

function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

// ---------------------------------------------------------------------------
// Internal helper: syntactic RRULE validation
// ---------------------------------------------------------------------------

function isValidRRuleString(rule: string): boolean {
  const stripped = rule.replace(/^RRULE:/i, '').trim()
  if (!/\bFREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)\b/.test(stripped)) return false
  if (!/^[A-Z]+=[^\s;]+(;[A-Z]+=[^\s;]+)*$/.test(stripped)) return false
  return true
}

function isValidRRules(entries: RRuleEntry[]): boolean {
  if (!Array.isArray(entries) || entries.length === 0) return false
  for (const entry of entries) {
    if (typeof entry.rrule !== 'string') return false
    if (typeof entry.startOffset !== 'number' || !Number.isInteger(entry.startOffset) || entry.startOffset < 0) return false
    if (!isValidRRuleString(entry.rrule)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// listPlatoonsServerFn
// ---------------------------------------------------------------------------

export const listPlatoonsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListPlatoonsInput) => d)
  .handler(async (ctx): Promise<ListPlatoonsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type OrgSettingsRow = { schedule_day_start: string }
    const orgSettings = await env.DB.prepare(
      `SELECT schedule_day_start FROM organization WHERE id = ?`,
    )
      .bind(membership.orgId)
      .first<OrgSettingsRow>()

    type PlatoonRow = {
      id: string
      name: string
      shift_label: string
      rrules: string
      start_date: string
      shift_start_time: string
      shift_end_time: string
      description: string | null
      color: string | null
      member_count: number
    }

    const rows = await env.DB.prepare(
      `SELECT p.id, p.name, p.shift_label, p.rrules, p.start_date, p.shift_start_time, p.shift_end_time,
              p.description, p.color, COUNT(pm.id) AS member_count
       FROM platoon p
       LEFT JOIN platoon_membership pm ON pm.platoon_id = p.id
       WHERE p.org_id = ?
       GROUP BY p.id
       ORDER BY LOWER(p.name) ASC`,
    )
      .bind(membership.orgId)
      .all<PlatoonRow>()

    const platoons: PlatoonView[] = (rows.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      shiftLabel: r.shift_label,
      rrules: JSON.parse(r.rrules) as RRuleEntry[],
      startDate: r.start_date,
      shiftStartTime: r.shift_start_time,
      shiftEndTime: r.shift_end_time,
      description: r.description,
      color: r.color,
      memberCount: r.member_count,
    }))

    return { success: true, platoons, scheduleDayStart: orgSettings?.schedule_day_start ?? '00:00' }
  })

// ---------------------------------------------------------------------------
// getPlatoonServerFn
// ---------------------------------------------------------------------------

export const getPlatoonServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetPlatoonInput) => d)
  .handler(async (ctx): Promise<GetPlatoonOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type PlatoonRow = {
      id: string
      name: string
      shift_label: string
      rrules: string
      start_date: string
      shift_start_time: string
      shift_end_time: string
      description: string | null
      color: string | null
    }
    const platoonRow = await env.DB.prepare(
      `SELECT id, name, shift_label, rrules, start_date, shift_start_time, shift_end_time, description, color
       FROM platoon WHERE id = ? AND org_id = ?`,
    )
      .bind(data.platoonId, membership.orgId)
      .first<PlatoonRow>()
    if (!platoonRow) return { success: false, error: 'NOT_FOUND' }

    type MemberRow = { staff_member_id: string; name: string; position_id: string | null; position_name: string | null }
    const memberRows = await env.DB.prepare(
      `SELECT sm.id AS staff_member_id, sm.name, pm.position_id, pos.name AS position_name
       FROM platoon_membership pm
       JOIN staff_member sm ON sm.id = pm.staff_member_id
       LEFT JOIN position pos ON pos.id = pm.position_id
       WHERE pm.platoon_id = ?
       ORDER BY COALESCE(pos.sort_order, -1) DESC, sm.name ASC`,
    )
      .bind(data.platoonId)
      .all<MemberRow>()

    type StaffRow = { id: string; name: string; current_platoon_name: string | null }
    const staffRows = await env.DB.prepare(
      `SELECT sm.id, sm.name, p.name AS current_platoon_name
       FROM staff_member sm
       LEFT JOIN platoon_membership pm ON pm.staff_member_id = sm.id
       LEFT JOIN platoon p ON p.id = pm.platoon_id
       WHERE sm.org_id = ? AND sm.status != 'removed'
       ORDER BY sm.name ASC`,
    )
      .bind(membership.orgId)
      .all<StaffRow>()

    type PositionRow = { id: string; name: string }
    const positionRows = await env.DB.prepare(
      `SELECT id, name FROM position WHERE org_id = ? ORDER BY sort_order DESC, LOWER(name) ASC`,
    )
      .bind(membership.orgId)
      .all<PositionRow>()

    const members: PlatoonMemberView[] = (memberRows.results ?? []).map((r) => ({
      staffMemberId: r.staff_member_id,
      name: r.name,
      positionId: r.position_id,
      positionName: r.position_name,
    }))

    const allStaff: StaffOption[] = (staffRows.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      currentPlatoonName: r.current_platoon_name,
    }))

    const positions: PositionOption[] = (positionRows.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
    }))

    return {
      success: true,
      platoon: {
        id: platoonRow.id,
        name: platoonRow.name,
        shiftLabel: platoonRow.shift_label,
        rrules: JSON.parse(platoonRow.rrules) as RRuleEntry[],
        startDate: platoonRow.start_date,
        shiftStartTime: platoonRow.shift_start_time,
        shiftEndTime: platoonRow.shift_end_time,
        description: platoonRow.description,
        color: platoonRow.color,
        members,
      },
      allStaff,
      positions,
    }
  })

// ---------------------------------------------------------------------------
// createPlatoonServerFn
// ---------------------------------------------------------------------------

export const createPlatoonServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreatePlatoonInput) => d)
  .handler(async (ctx): Promise<CreatePlatoonOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    if (!isValidRRules(data.rrules)) {
      return { success: false, error: 'INVALID_RRULE' }
    }

    const shiftStartTime = data.shiftStartTime ?? '08:00'
    const shiftEndTime = data.shiftEndTime ?? '08:00'
    if (!isValidTime(shiftStartTime) || !isValidTime(shiftEndTime)) {
      return { success: false, error: 'INVALID_RRULE' }
    }

    type DupRow = { id: string }
    const dupRow = await env.DB.prepare(
      `SELECT id FROM platoon WHERE org_id = ? AND LOWER(name) = LOWER(?)`,
    )
      .bind(membership.orgId, data.name)
      .first<DupRow>()
    if (dupRow) return { success: false, error: 'DUPLICATE_NAME' }

    const platoonId = crypto.randomUUID()
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO platoon(id, org_id, name, shift_label, rrules, start_date, shift_start_time, shift_end_time, description, color, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        platoonId,
        membership.orgId,
        data.name,
        data.shiftLabel,
        JSON.stringify(data.rrules),
        data.startDate,
        shiftStartTime,
        shiftEndTime,
        data.description ?? null,
        data.color ?? null,
        now,
        now,
      )
      .run()

    return { success: true, platoonId }
  })

// ---------------------------------------------------------------------------
// updatePlatoonServerFn
// ---------------------------------------------------------------------------

export const updatePlatoonServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdatePlatoonInput) => d)
  .handler(async (ctx): Promise<UpdatePlatoonOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type PlatoonRow = { id: string }
    const platoonRow = await env.DB.prepare(
      `SELECT id FROM platoon WHERE id = ? AND org_id = ?`,
    )
      .bind(data.platoonId, membership.orgId)
      .first<PlatoonRow>()
    if (!platoonRow) return { success: false, error: 'NOT_FOUND' }

    if (!isValidRRules(data.rrules)) {
      return { success: false, error: 'INVALID_RRULE' }
    }

    if (!isValidTime(data.shiftStartTime) || !isValidTime(data.shiftEndTime)) {
      return { success: false, error: 'INVALID_RRULE' }
    }

    type DupRow = { id: string }
    const dupRow = await env.DB.prepare(
      `SELECT id FROM platoon WHERE org_id = ? AND LOWER(name) = LOWER(?) AND id != ?`,
    )
      .bind(membership.orgId, data.name, data.platoonId)
      .first<DupRow>()
    if (dupRow) return { success: false, error: 'DUPLICATE_NAME' }

    await env.DB.prepare(
      `UPDATE platoon SET name=?, shift_label=?, rrules=?, start_date=?, shift_start_time=?, shift_end_time=?, description=?, color=?, updated_at=?
       WHERE id=? AND org_id=?`,
    )
      .bind(
        data.name,
        data.shiftLabel,
        JSON.stringify(data.rrules),
        data.startDate,
        data.shiftStartTime,
        data.shiftEndTime,
        data.description ?? null,
        data.color ?? null,
        new Date().toISOString(),
        data.platoonId,
        membership.orgId,
      )
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// deletePlatoonServerFn
// ---------------------------------------------------------------------------

export const deletePlatoonServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeletePlatoonInput) => d)
  .handler(async (ctx): Promise<DeletePlatoonOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type PlatoonRow = { id: string }
    const platoonRow = await env.DB.prepare(
      `SELECT id FROM platoon WHERE id = ? AND org_id = ?`,
    )
      .bind(data.platoonId, membership.orgId)
      .first<PlatoonRow>()
    if (!platoonRow) return { success: false, error: 'NOT_FOUND' }

    await env.DB.prepare(`DELETE FROM platoon WHERE id = ? AND org_id = ?`)
      .bind(data.platoonId, membership.orgId)
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// assignMemberServerFn
// ---------------------------------------------------------------------------

export const assignMemberServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: AssignMemberInput) => d)
  .handler(async (ctx): Promise<AssignMemberOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type PlatoonRow = { id: string }
    const platoonRow = await env.DB.prepare(
      `SELECT id FROM platoon WHERE id = ? AND org_id = ?`,
    )
      .bind(data.platoonId, membership.orgId)
      .first<PlatoonRow>()
    if (!platoonRow) return { success: false, error: 'PLATOON_NOT_FOUND' }

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()
    if (!staffRow) return { success: false, error: 'MEMBER_NOT_FOUND' }

    // Check for existing membership to determine movedFrom
    type ExistingRow = { platoon_name: string }
    const existingRow = await env.DB.prepare(
      `SELECT p.name AS platoon_name
       FROM platoon_membership pm
       JOIN platoon p ON p.id = pm.platoon_id
       WHERE pm.staff_member_id = ?`,
    )
      .bind(data.staffMemberId)
      .first<ExistingRow>()

    const movedFrom = existingRow ? existingRow.platoon_name : null

    await env.DB.prepare(
      `INSERT OR REPLACE INTO platoon_membership(id, platoon_id, staff_member_id, position_id, assigned_at)
       VALUES(?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), data.platoonId, data.staffMemberId, data.positionId ?? null, new Date().toISOString())
      .run()

    return { success: true, movedFrom }
  })

// ---------------------------------------------------------------------------
// removeMemberFromPlatoonServerFn
// ---------------------------------------------------------------------------

export const removeMemberFromPlatoonServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: RemoveMemberFromPlatoonInput) => d)
  .handler(async (ctx): Promise<RemoveMemberFromPlatoonOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'create-edit-schedules')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const result = await env.DB.prepare(
      `DELETE FROM platoon_membership WHERE platoon_id = ? AND staff_member_id = ?`,
    )
      .bind(data.platoonId, data.staffMemberId)
      .run()

    if (result.meta.changes === 0) return { success: false, error: 'NOT_FOUND' }

    return { success: true }
  })

// ---------------------------------------------------------------------------
// getStaffPlatoonServerFn — get current platoon for a staff member
// ---------------------------------------------------------------------------

export const getStaffPlatoonServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetStaffPlatoonInput) => d)
  .handler(async (ctx): Promise<GetStaffPlatoonOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type Row = { platoon_id: string; platoon_name: string; position_id: string | null; position_name: string | null }
    const [row, positionRows] = await Promise.all([
      env.DB.prepare(
        `SELECT pm.platoon_id, p.name AS platoon_name, pm.position_id, pos.name AS position_name
         FROM platoon_membership pm
         JOIN platoon p ON p.id = pm.platoon_id
         LEFT JOIN position pos ON pos.id = pm.position_id
         WHERE pm.staff_member_id = ?
           AND p.org_id = ?`,
      )
        .bind(data.staffMemberId, membership.orgId)
        .first<Row>(),
      env.DB.prepare(
        `SELECT id, name FROM position WHERE org_id = ? ORDER BY sort_order DESC, LOWER(name) ASC`,
      )
        .bind(membership.orgId)
        .all<{ id: string; name: string }>(),
    ])

    const positions: PositionOption[] = (positionRows.results ?? []).map((r) => ({ id: r.id, name: r.name }))
    return {
      success: true,
      platoonId: row?.platoon_id ?? null,
      platoonName: row?.platoon_name ?? null,
      positionId: row?.position_id ?? null,
      positionName: row?.position_name ?? null,
      positions,
    }
  })
