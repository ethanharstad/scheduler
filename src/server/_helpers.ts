import { getCookie } from '@tanstack/react-start/server'
import type { OrgRole } from '@/lib/org.types'
export type MembershipContext = {
  userId: string
  membershipId: string
  orgId: string
  role: OrgRole
  isSystemAdmin: boolean
}

export async function requireOrgMembership(
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


