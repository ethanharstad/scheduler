import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import type { OrgRole } from '@/lib/org.types'
import { canDo, getPermissions } from '@/lib/rbac'
import type {
  ChangeMemberRoleInput,
  ChangeMemberRoleOutput,
  GetMemberPermissionsInput,
  GetMemberPermissionsOutput,
  ListMembersInput,
  ListMembersOutput,
  OrgMemberView,
  RemoveMemberInput,
  RemoveMemberOutput,
  TransferOwnershipInput,
  TransferOwnershipOutput,
} from '@/lib/rbac.types'

// ---------------------------------------------------------------------------
// Internal helper: resolve session + org membership in one call
// ---------------------------------------------------------------------------

type MembershipContext = {
  userId: string
  membershipId: string
  orgId: string
  role: OrgRole
}

async function requireOrgMembership(
  env: Cloudflare.Env,
  orgSlug: string,
): Promise<MembershipContext | null> {
  const sessionToken = getCookie('session')
  if (!sessionToken) return null

  const now = new Date().toISOString()

  type SessionRow = { user_id: string }
  const sessionRow = await env.DB.prepare(
    `SELECT user_id FROM session WHERE session_token = ? AND expires_at > ?`,
  )
    .bind(sessionToken, now)
    .first<SessionRow>()
  if (!sessionRow) return null

  type MemberRow = { membership_id: string; org_id: string; role: string }
  const memberRow = await env.DB.prepare(
    `SELECT m.id AS membership_id, m.org_id, m.role
     FROM org_membership m
     JOIN organization o ON o.id = m.org_id
     WHERE o.slug = ? AND o.status = 'active'
       AND m.user_id = ? AND m.status = 'active'`,
  )
    .bind(orgSlug, sessionRow.user_id)
    .first<MemberRow>()
  if (!memberRow) return null

  return {
    userId: sessionRow.user_id,
    membershipId: memberRow.membership_id,
    orgId: memberRow.org_id,
    role: memberRow.role as OrgRole,
  }
}

// ---------------------------------------------------------------------------
// listMembersServerFn
// ---------------------------------------------------------------------------

export const listMembersServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListMembersInput) => d)
  .handler(async (ctx): Promise<ListMembersOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type MemberRow = {
      membership_id: string
      user_id: string
      email: string
      display_name: string | null
      role: string
      joined_at: string
    }

    const rows = await env.DB.prepare(
      `SELECT m.id AS membership_id, m.user_id, u.email,
              p.display_name, m.role, m.joined_at
       FROM org_membership m
       JOIN user u ON u.id = m.user_id
       LEFT JOIN user_profile p ON p.user_id = m.user_id
       WHERE m.org_id = ? AND m.status = 'active'
       ORDER BY m.joined_at ASC`,
    )
      .bind(membership.orgId)
      .all<MemberRow>()

    const members: OrgMemberView[] = (rows.results ?? []).map((r) => ({
      memberId: r.membership_id,
      userId: r.user_id,
      email: r.email,
      displayName: r.display_name ?? r.email.split('@')[0],
      role: r.role as OrgRole,
      joinedAt: r.joined_at,
    }))

    return { success: true, members }
  })

// ---------------------------------------------------------------------------
// changeMemberRoleServerFn
// ---------------------------------------------------------------------------

export const changeMemberRoleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ChangeMemberRoleInput) => d)
  .handler(async (ctx): Promise<ChangeMemberRoleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'assign-roles')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    if (data.newRole === 'owner') {
      return { success: false, error: 'INVALID_ROLE' }
    }

    type TargetRow = { role: string }
    const targetRow = await env.DB.prepare(
      `SELECT role FROM org_membership WHERE id = ? AND org_id = ? AND status = 'active'`,
    )
      .bind(data.memberId, membership.orgId)
      .first<TargetRow>()
    if (!targetRow) return { success: false, error: 'NOT_FOUND' }

    if (targetRow.role === 'owner') {
      type CountRow = { count: number }
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM org_membership
         WHERE org_id = ? AND role = 'owner' AND status = 'active'`,
      )
        .bind(membership.orgId)
        .first<CountRow>()
      if ((countRow?.count ?? 0) <= 1) {
        return { success: false, error: 'LAST_OWNER' }
      }
    }

    await env.DB.prepare(
      `UPDATE org_membership SET role = ? WHERE id = ? AND org_id = ?`,
    )
      .bind(data.newRole, data.memberId, membership.orgId)
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// removeMemberServerFn
// ---------------------------------------------------------------------------

export const removeMemberServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: RemoveMemberInput) => d)
  .handler(async (ctx): Promise<RemoveMemberOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'remove-members')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type TargetRow = { role: string }
    const targetRow = await env.DB.prepare(
      `SELECT role FROM org_membership WHERE id = ? AND org_id = ? AND status = 'active'`,
    )
      .bind(data.memberId, membership.orgId)
      .first<TargetRow>()
    if (!targetRow) return { success: false, error: 'NOT_FOUND' }

    if (targetRow.role === 'owner' && membership.role !== 'owner') {
      return { success: false, error: 'FORBIDDEN' }
    }

    if (targetRow.role === 'owner') {
      type CountRow = { count: number }
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM org_membership
         WHERE org_id = ? AND role = 'owner' AND status = 'active'`,
      )
        .bind(membership.orgId)
        .first<CountRow>()
      if ((countRow?.count ?? 0) <= 1) {
        return { success: false, error: 'LAST_OWNER' }
      }
    }

    await env.DB.prepare(
      `UPDATE org_membership SET status = 'inactive' WHERE id = ? AND org_id = ?`,
    )
      .bind(data.memberId, membership.orgId)
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// transferOwnershipServerFn
// ---------------------------------------------------------------------------

export const transferOwnershipServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: TransferOwnershipInput) => d)
  .handler(async (ctx): Promise<TransferOwnershipOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'transfer-ownership')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    if (data.newOwnerMemberId === membership.membershipId) {
      return { success: false, error: 'SELF_TRANSFER' }
    }

    type TargetRow = { id: string }
    const targetRow = await env.DB.prepare(
      `SELECT id FROM org_membership WHERE id = ? AND org_id = ? AND status = 'active'`,
    )
      .bind(data.newOwnerMemberId, membership.orgId)
      .first<TargetRow>()
    if (!targetRow) return { success: false, error: 'NOT_FOUND' }

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE org_membership SET role = 'owner' WHERE id = ? AND org_id = ?`,
      ).bind(data.newOwnerMemberId, membership.orgId),
      env.DB.prepare(
        `UPDATE org_membership SET role = 'admin' WHERE id = ? AND org_id = ?`,
      ).bind(membership.membershipId, membership.orgId),
    ])

    return { success: true }
  })

// ---------------------------------------------------------------------------
// getMemberPermissionsServerFn
// ---------------------------------------------------------------------------

export const getMemberPermissionsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetMemberPermissionsInput) => d)
  .handler(async (ctx): Promise<GetMemberPermissionsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    return {
      success: true,
      role: membership.role,
      permissions: getPermissions(membership.role),
    }
  })
