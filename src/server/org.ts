import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import {
  type CreateOrgInput,
  type OrgMembershipView,
  type OrgRole,
  type OrgView,
} from '@/lib/org.types'

// ---------------------------------------------------------------------------
// Internal: session helper
// ---------------------------------------------------------------------------

async function getAuthenticatedUser(env: Cloudflare.Env): Promise<{ userId: string; isSystemAdmin: boolean } | null> {
  const sessionToken = getCookie('session')
  if (!sessionToken) return null
  const now = new Date().toISOString()
  type SessionRow = { user_id: string; is_system_admin: number }
  const row = await env.DB.prepare(
    `SELECT s.user_id, u.is_system_admin
     FROM session s
     JOIN user u ON u.id = s.user_id
     WHERE s.session_token = ? AND s.expires_at > ?`,
  )
    .bind(sessionToken, now)
    .first<SessionRow>()
  if (!row) return null
  return { userId: row.user_id, isSystemAdmin: row.is_system_admin === 1 }
}

// ---------------------------------------------------------------------------
// createOrgServerFn (US1)
// ---------------------------------------------------------------------------

type CreateOrgOutput =
  | { success: true; orgSlug: string }
  | {
      success: false
      error: 'INVALID_INPUT' | 'SLUG_TAKEN' | 'ORG_LIMIT_REACHED'
      field?: 'name' | 'slug'
    }

export const createOrgServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateOrgInput) => d)
  .handler(async (ctx): Promise<CreateOrgOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const auth = await getAuthenticatedUser(env)
    if (!auth) return { success: false, error: 'INVALID_INPUT' }
    const userId = auth.userId

    const name = data.name.trim()
    if (name.length < 2 || name.length > 100) {
      return { success: false, error: 'INVALID_INPUT', field: 'name' }
    }

    const slug = data.slug.trim()
    const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{2}$/
    if (!slugRegex.test(slug) || slug.length > 50) {
      return { success: false, error: 'INVALID_INPUT', field: 'slug' }
    }

    type CountRow = { count: number }
    const limitRow = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM org_membership WHERE user_id = ?`,
    )
      .bind(userId)
      .first<CountRow>()
    if ((limitRow?.count ?? 0) >= 10) {
      return { success: false, error: 'ORG_LIMIT_REACHED' }
    }

    const orgId = globalThis.crypto.randomUUID()
    const membershipId = globalThis.crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO organization (id, slug, name, plan, status, created_at)
           VALUES (?, ?, ?, 'free', 'active', ?)`,
        ).bind(orgId, slug, name, now),
        env.DB.prepare(
          `INSERT INTO org_membership (id, org_id, user_id, role, status, joined_at)
           VALUES (?, ?, ?, 'owner', 'active', ?)`,
        ).bind(membershipId, orgId, userId, now),
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE constraint failed') && msg.includes('organization.slug')) {
        return { success: false, error: 'SLUG_TAKEN', field: 'slug' }
      }
      throw err
    }

    return { success: true, orgSlug: slug }
  })

// ---------------------------------------------------------------------------
// listUserOrgsServerFn (US1)
// ---------------------------------------------------------------------------

type ListUserOrgsOutput =
  | { success: true; orgs: OrgMembershipView[]; atLimit: boolean }
  | { success: false; error: 'UNAUTHORIZED' }

export const listUserOrgsServerFn = createServerFn({ method: 'GET' }).handler(
  async (ctx): Promise<ListUserOrgsOutput> => {
    const env = ctx.context as unknown as Cloudflare.Env

    const auth = await getAuthenticatedUser(env)
    if (!auth) return { success: false, error: 'UNAUTHORIZED' }
    const userId = auth.userId

    type OrgRow = { id: string; slug: string; name: string; role: string }
    const rows = await env.DB.prepare(
      `SELECT o.id, o.slug, o.name, m.role
       FROM organization o
       JOIN org_membership m ON o.id = m.org_id
       WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active'
       ORDER BY m.joined_at ASC`,
    )
      .bind(userId)
      .all<OrgRow>()

    const orgs: OrgMembershipView[] = (rows.results ?? []).map((r) => ({
      orgId: r.id,
      orgSlug: r.slug,
      orgName: r.name,
      role: r.role as OrgRole,
    }))

    return { success: true, orgs, atLimit: orgs.length >= 10 }
  },
)

// ---------------------------------------------------------------------------
// getOrgServerFn (US2)
// ---------------------------------------------------------------------------

type GetOrgOutput =
  | { success: true; org: OrgView; userRole: OrgRole }
  | { success: false; error: 'NOT_FOUND' | 'UNAUTHORIZED' }

export const getOrgServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { slug: string }) => d)
  .handler(async (ctx): Promise<GetOrgOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const auth = await getAuthenticatedUser(env)
    if (!auth) return { success: false, error: 'UNAUTHORIZED' }
    const userId = auth.userId

    type OrgRow = {
      id: string
      slug: string
      name: string
      plan: string
      created_at: string
    }
    const orgRow = await env.DB.prepare(
      `SELECT id, slug, name, plan, created_at
       FROM organization WHERE slug = ? AND status = 'active'`,
    )
      .bind(data.slug)
      .first<OrgRow>()

    if (!orgRow) return { success: false, error: 'NOT_FOUND' }

    type MemberRow = { role: string }
    const memberRow = await env.DB.prepare(
      `SELECT role FROM org_membership
       WHERE org_id = ? AND user_id = ? AND status = 'active'`,
    )
      .bind(orgRow.id, userId)
      .first<MemberRow>()

    if (!memberRow && !auth.isSystemAdmin) return { success: false, error: 'UNAUTHORIZED' }

    return {
      success: true,
      org: {
        id: orgRow.id,
        slug: orgRow.slug,
        name: orgRow.name,
        plan: orgRow.plan,
        createdAt: orgRow.created_at,
      },
      userRole: memberRow ? (memberRow.role as OrgRole) : ('owner' as OrgRole),
    }
  })
