import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import type { OrgRole } from '@/lib/org.types'
import { canDo, getPermissions } from '@/lib/rbac'
import { getOrgStub } from '@/server/_do-helpers'
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

  // Look up org id
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
// listMembersServerFn
// ---------------------------------------------------------------------------

export const listMembersServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListMembersInput) => d)
  .handler(async (ctx): Promise<ListMembersOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    // Read memberships from DO (sole source of truth), enrich with D1 user details
    const stub = getOrgStub(env, membership.orgId)
    const doMembers = await stub.listMemberships()

    if (doMembers.length === 0) {
      return { success: true, members: [] }
    }

    // Batch lookup user details from D1
    const userIds = doMembers.map((m) => m.userId)
    const ph = userIds.map(() => '?').join(',')
    type UserRow = { id: string; email: string; display_name: string | null }
    const userRows = await env.DB.prepare(
      `SELECT u.id, u.email, p.display_name
       FROM user u
       LEFT JOIN user_profile p ON p.user_id = u.id
       WHERE u.id IN (${ph})`,
    )
      .bind(...userIds)
      .all<UserRow>()

    const userMap = new Map<string, UserRow>()
    for (const u of userRows.results ?? []) {
      userMap.set(u.id, u)
    }

    const members: OrgMemberView[] = doMembers.map((m) => {
      const user = userMap.get(m.userId)
      return {
        memberId: m.id,
        userId: m.userId,
        email: user?.email ?? '',
        displayName: user?.display_name ?? user?.email?.split('@')[0] ?? '',
        role: m.role,
        joinedAt: m.joinedAt,
      }
    })

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

    // Update membership role in DO
    type UserIdRow = { user_id: string }
    const userIdRow = await env.DB.prepare(
      `SELECT user_id FROM org_membership WHERE id = ? AND org_id = ?`,
    )
      .bind(data.memberId, membership.orgId)
      .first<UserIdRow>()
    if (userIdRow) {
      const stub = getOrgStub(env, membership.orgId)
      await stub.updateMembershipRole(userIdRow.user_id, data.newRole)
    }

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

    // Deactivate membership in DO
    type UserIdRow = { user_id: string }
    const userIdRow = await env.DB.prepare(
      `SELECT user_id FROM org_membership WHERE id = ? AND org_id = ?`,
    )
      .bind(data.memberId, membership.orgId)
      .first<UserIdRow>()
    if (userIdRow) {
      const stub = getOrgStub(env, membership.orgId)
      await stub.deactivateMembership(userIdRow.user_id)
    }

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

    // Transfer ownership in DO
    type UserIdRow = { user_id: string }
    const newOwnerRow = await env.DB.prepare(
      `SELECT user_id FROM org_membership WHERE id = ? AND org_id = ?`,
    )
      .bind(data.newOwnerMemberId, membership.orgId)
      .first<UserIdRow>()
    if (newOwnerRow) {
      const stub = getOrgStub(env, membership.orgId)
      await stub.updateMembershipRole(newOwnerRow.user_id, 'owner')
      await stub.updateMembershipRole(membership.userId, 'admin')
    }

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
