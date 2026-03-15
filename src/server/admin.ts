import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import type {
  AdminStatsOutput,
  BackupOrgInput,
  ListOrgsInput,
  ListOrgsOutput,
  ListUsersInput,
  ListUsersOutput,
  OrgBackup,
  RestoreOrgInput,
  ToggleAdminInput,
  ToggleAdminOutput,
} from '@/lib/admin.types'
import { getOrgStub } from './_do-helpers'

// ---------------------------------------------------------------------------
// Internal: require system admin session
// ---------------------------------------------------------------------------

async function requireSystemAdmin(
  env: Cloudflare.Env,
): Promise<string | null> {
  const sessionToken = getCookie('session')
  if (!sessionToken) return null
  const now = new Date().toISOString()

  type Row = { user_id: string; is_system_admin: number }
  const row = await env.DB.prepare(
    `SELECT s.user_id, u.is_system_admin
     FROM session s
     JOIN user u ON u.id = s.user_id
     WHERE s.session_token = ? AND s.expires_at > ?`,
  )
    .bind(sessionToken, now)
    .first<Row>()

  if (!row || row.is_system_admin !== 1) return null
  return row.user_id
}

// ---------------------------------------------------------------------------
// listAllUsersServerFn
// ---------------------------------------------------------------------------

export const listAllUsersServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListUsersInput) => d)
  .handler(async (ctx): Promise<ListUsersOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const adminId = await requireSystemAdmin(env)
    if (!adminId) return { success: false, error: 'UNAUTHORIZED' }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = ((data.page ?? 1) - 1) * limit

    type CountRow = { total: number }
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM user`,
    )
      .first<CountRow>()
    const total = countRow?.total ?? 0

    type UserRow = {
      id: string
      email: string
      verified: number
      is_system_admin: number
      org_count: number
      created_at: string
    }
    const rows = await env.DB.prepare(
      `SELECT u.id, u.email, u.verified, u.is_system_admin,
              (SELECT COUNT(*) FROM org_membership m WHERE m.user_id = u.id AND m.status = 'active') AS org_count,
              u.created_at
       FROM user u
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all<UserRow>()

    return {
      success: true,
      total,
      users: (rows.results ?? []).map((r) => ({
        id: r.id,
        email: r.email,
        verified: r.verified === 1,
        isSystemAdmin: r.is_system_admin === 1,
        orgCount: r.org_count,
        createdAt: r.created_at,
      })),
    }
  })

// ---------------------------------------------------------------------------
// listAllOrgsServerFn
// ---------------------------------------------------------------------------

export const listAllOrgsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListOrgsInput) => d)
  .handler(async (ctx): Promise<ListOrgsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const adminId = await requireSystemAdmin(env)
    if (!adminId) return { success: false, error: 'UNAUTHORIZED' }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = ((data.page ?? 1) - 1) * limit

    type CountRow = { total: number }
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM organization`,
    )
      .first<CountRow>()
    const total = countRow?.total ?? 0

    type OrgRow = {
      id: string
      slug: string
      name: string
      plan: string
      status: string
      member_count: number
      created_at: string
    }
    const rows = await env.DB.prepare(
      `SELECT o.id, o.slug, o.name, o.plan, o.status,
              (SELECT COUNT(*) FROM org_membership m WHERE m.org_id = o.id AND m.status = 'active') AS member_count,
              o.created_at
       FROM organization o
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all<OrgRow>()

    return {
      success: true,
      total,
      orgs: (rows.results ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        plan: r.plan,
        status: r.status,
        memberCount: r.member_count,
        createdAt: r.created_at,
      })),
    }
  })

// ---------------------------------------------------------------------------
// toggleSystemAdminServerFn
// ---------------------------------------------------------------------------

export const toggleSystemAdminServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ToggleAdminInput) => d)
  .handler(async (ctx): Promise<ToggleAdminOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const adminId = await requireSystemAdmin(env)
    if (!adminId) return { success: false, error: 'UNAUTHORIZED' }

    // Verify target user exists
    type UserRow = { id: string; is_system_admin: number }
    const userRow = await env.DB.prepare(
      `SELECT id, is_system_admin FROM user WHERE id = ?`,
    )
      .bind(data.userId)
      .first<UserRow>()
    if (!userRow) return { success: false, error: 'NOT_FOUND' }

    // Prevent removing the last admin
    if (!data.enable && userRow.is_system_admin === 1) {
      type CountRow = { count: number }
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM user WHERE is_system_admin = 1`,
      )
        .first<CountRow>()
      if ((countRow?.count ?? 0) <= 1) {
        return { success: false, error: 'LAST_ADMIN' }
      }
    }

    await env.DB.prepare(
      `UPDATE user SET is_system_admin = ? WHERE id = ?`,
    )
      .bind(data.enable ? 1 : 0, data.userId)
      .run()

    // Invalidate all sessions for the target user to force re-login
    await env.DB.prepare(
      `DELETE FROM session WHERE user_id = ?`,
    )
      .bind(data.userId)
      .run()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// getAdminStatsServerFn
// ---------------------------------------------------------------------------

export const getAdminStatsServerFn = createServerFn({ method: 'GET' }).handler(
  async (ctx): Promise<AdminStatsOutput> => {
    const env = ctx.context as unknown as Cloudflare.Env

    const adminId = await requireSystemAdmin(env)
    if (!adminId) return { success: false, error: 'UNAUTHORIZED' }

    const now = new Date().toISOString()

    type CountRow = { count: number }
    const [usersRow, orgsRow, sessionsRow] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS count FROM user`).first<CountRow>(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM organization`).first<CountRow>(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM session WHERE expires_at > ?`).bind(now).first<CountRow>(),
    ])

    return {
      success: true,
      stats: {
        totalUsers: usersRow?.count ?? 0,
        totalOrgs: orgsRow?.count ?? 0,
        activeSessions: sessionsRow?.count ?? 0,
      },
    }
  },
)

// ---------------------------------------------------------------------------
// backupOrgServerFn
// ---------------------------------------------------------------------------

export const backupOrgServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: BackupOrgInput) => d)
  .handler(async (ctx) => {
    const env = ctx.context as unknown as Cloudflare.Env
    const adminId = await requireSystemAdmin(env)
    if (!adminId) return { success: false as const, error: 'UNAUTHORIZED' as const }

    const { orgId } = ctx.data

    type OrgRow = { id: string; slug: string; name: string; plan: string; status: string; created_at: string }
    const orgRow = await env.DB.prepare('SELECT * FROM organization WHERE id = ?')
      .bind(orgId)
      .first<OrgRow>()
    if (!orgRow) return { success: false as const, error: 'NOT_FOUND' as const }

    const memberships = await env.DB.prepare(
      'SELECT * FROM org_membership WHERE org_id = ?',
    ).bind(orgId).all()

    const invitations = await env.DB.prepare(
      'SELECT * FROM invitation_token_index WHERE org_id = ?',
    ).bind(orgId).all()

    const stub = getOrgStub(env, orgId)
    const doData = await stub.exportAllData()

    const backup: OrgBackup = {
      _meta: {
        version: 1,
        exportedAt: new Date().toISOString(),
        exportedBy: adminId,
        orgId,
        orgSlug: orgRow.slug,
        orgName: orgRow.name,
      },
      d1: {
        organization: orgRow,
        org_memberships: memberships.results ?? [],
        invitation_token_index: invitations.results ?? [],
      },
      do: doData,
    }

    return { success: true as const, backup }
  })

// ---------------------------------------------------------------------------
// restoreOrgServerFn
// ---------------------------------------------------------------------------

export const restoreOrgServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: RestoreOrgInput) => d)
  .handler(async (ctx) => {
    const env = ctx.context as unknown as Cloudflare.Env
    const adminId = await requireSystemAdmin(env)
    if (!adminId) return { success: false as const, error: 'UNAUTHORIZED' as const }

    const { orgId, backup } = ctx.data

    if (!backup?._meta?.version || backup._meta.version !== 1) {
      return { success: false as const, error: 'INVALID_BACKUP' as const }
    }

    type IdRow = { id: string }
    const orgRow = await env.DB.prepare('SELECT id FROM organization WHERE id = ?')
      .bind(orgId)
      .first<IdRow>()
    if (!orgRow) return { success: false as const, error: 'NOT_FOUND' as const }

    const stub = getOrgStub(env, orgId)
    await stub.importAllData(backup.do)

    return { success: true as const }
  })
