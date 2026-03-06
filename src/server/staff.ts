import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie, getRequestUrl } from '@tanstack/react-start/server'
import { hashPassword } from '@/lib/auth'
import { canDo } from '@/lib/rbac'
import type { OrgRole } from '@/lib/org.types'
import type {
  AcceptInvitationInput,
  AddStaffMemberInput,
  ChangeStaffRoleInput,
  GetInvitationInput,
  GetStaffAuditLogInput,
  InvitationActionInput,
  InvitationView,
  InviteStaffMemberInput,
  RemoveStaffMemberInput,
  StaffAuditAction,
  StaffAuditEntry,
  StaffMemberView,
} from '@/lib/staff.types'

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function generateToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function invalidateUserSessions(
  env: Cloudflare.Env,
  userId: string,
): Promise<void> {
  await env.DB.prepare('DELETE FROM session WHERE user_id = ?')
    .bind(userId)
    .run()
}

async function writeAuditLog(
  env: Cloudflare.Env,
  entry: {
    orgId: string
    staffMemberId: string | null
    performedBy: string | null
    action: StaffAuditAction
    metadata?: Record<string, string>
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO staff_audit_log (id, org_id, staff_member_id, performed_by, action, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      entry.orgId,
      entry.staffMemberId,
      entry.performedBy,
      entry.action,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      new Date().toISOString(),
    )
    .run()
}

function getRequestOrigin(): string {
  try {
    return getRequestUrl().origin
  } catch {
    return 'http://localhost:3000'
  }
}

async function sendInvitationEmail(
  to: string,
  token: string,
  orgName: string,
  inviterName: string | null,
  apiKey: string,
): Promise<void> {
  const origin = getRequestOrigin()
  const url = `${origin}/join/${token}`
  const fromLine = inviterName ? `${inviterName} has invited` : 'You have been invited'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'noreply@scheduler.tailboardapp.com',
      to,
      subject: `You've been invited to join ${orgName} on Scheduler`,
      html: `<p>${fromLine} you to join <strong>${orgName}</strong> on Scheduler.</p>
             <p><a href="${url}">Accept invitation</a></p>
             <p>This link expires in 7 days.</p>`,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)')
    console.error(`[email] Resend API error ${res.status} for ${to}: ${body}`)
  }
}

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
// listStaffServerFn
// ---------------------------------------------------------------------------

type ListStaffOutput =
  | { success: true; members: StaffMemberView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export const listStaffServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { orgSlug: string }) => d)
  .handler(async (ctx): Promise<ListStaffOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type StaffRow = {
      id: string
      name: string
      email: string | null
      phone: string | null
      role: string
      status: string
      user_id: string | null
      created_at: string
      updated_at: string
    }

    const rows = await env.DB.prepare(
      `SELECT id, name, email, phone, role, status, user_id, created_at, updated_at
       FROM staff_member
       WHERE org_id = ? AND status != 'removed'
       ORDER BY name ASC`,
    )
      .bind(membership.orgId)
      .all<StaffRow>()

    const members: StaffMemberView[] = (rows.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role as OrgRole,
      status: r.status as StaffMemberView['status'],
      userId: r.user_id,
      addedAt: r.created_at,
      updatedAt: r.updated_at,
    }))

    return { success: true, members }
  })

// ---------------------------------------------------------------------------
// addStaffMemberServerFn
// ---------------------------------------------------------------------------

type AddStaffMemberOutput =
  | { success: true; member: StaffMemberView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'CONTACT_REQUIRED' | 'DUPLICATE_EMAIL' }

export const addStaffMemberServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: AddStaffMemberInput) => d)
  .handler(async (ctx): Promise<AddStaffMemberOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'invite-members')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const name = data.name?.trim()
    const email = data.email?.trim().toLowerCase() || null
    const phone = data.phone?.trim() || null

    if (!name) return { success: false, error: 'VALIDATION_ERROR' }
    if (!email && !phone) return { success: false, error: 'CONTACT_REQUIRED' }

    // Check for duplicate email within org
    if (email) {
      type DupRow = { id: string }
      const existing = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE org_id = ? AND email = ? AND status != 'removed'`,
      )
        .bind(membership.orgId, email)
        .first<DupRow>()
      if (existing) return { success: false, error: 'DUPLICATE_EMAIL' }
    }

    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    // Check if email matches an existing registered user
    let userId: string | null = null
    let status: 'active' | 'roster_only' = 'roster_only'

    if (email) {
      type UserRow = { id: string }
      const userRow = await env.DB.prepare(
        `SELECT id FROM user WHERE email = ?`,
      )
        .bind(email)
        .first<UserRow>()

      if (userRow) {
        // Check they're not already an active member
        type MemberRow = { id: string }
        const existingMembership = await env.DB.prepare(
          `SELECT id FROM org_membership WHERE org_id = ? AND user_id = ? AND status = 'active'`,
        )
          .bind(membership.orgId, userRow.id)
          .first<MemberRow>()

        if (!existingMembership) {
          userId = userRow.id
          status = 'active'
          // Create org_membership for the auto-linked user
          await env.DB.prepare(
            `INSERT INTO org_membership (id, org_id, user_id, role, status, joined_at)
             VALUES (?, ?, ?, ?, 'active', ?)`,
          )
            .bind(crypto.randomUUID(), membership.orgId, userId, data.role, now)
            .run()
        }
      }
    }

    await env.DB.prepare(
      `INSERT INTO staff_member (id, org_id, user_id, name, email, phone, role, status, added_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, membership.orgId, userId, name, email, phone, data.role, status, membership.userId, now, now)
      .run()

    await writeAuditLog(env, {
      orgId: membership.orgId,
      staffMemberId: id,
      performedBy: membership.userId,
      action: 'member_added',
      metadata: { name, ...(email ? { email } : {}) },
    })

    const member: StaffMemberView = {
      id,
      name,
      email,
      phone,
      role: data.role,
      status,
      userId,
      addedAt: now,
      updatedAt: now,
    }

    return { success: true, member }
  })

// ---------------------------------------------------------------------------
// inviteStaffMemberServerFn
// ---------------------------------------------------------------------------

type InviteOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_EMAIL' | 'ALREADY_ACTIVE' | 'ALREADY_PENDING' }

export const inviteStaffMemberServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: InviteStaffMemberInput) => d)
  .handler(async (ctx): Promise<InviteOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'invite-members')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type StaffRow = { email: string | null; status: string; name: string }
    const staffRow = await env.DB.prepare(
      `SELECT email, status, name FROM staff_member WHERE id = ? AND org_id = ?`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()

    if (!staffRow) return { success: false, error: 'NOT_FOUND' }
    if (!staffRow.email) return { success: false, error: 'NO_EMAIL' }
    if (staffRow.status === 'active') return { success: false, error: 'ALREADY_ACTIVE' }
    if (staffRow.status === 'pending') return { success: false, error: 'ALREADY_PENDING' }

    // Look up inviter display name
    type ProfileRow = { display_name: string | null }
    const profileRow = await env.DB.prepare(
      `SELECT display_name FROM user_profile WHERE user_id = ?`,
    )
      .bind(membership.userId)
      .first<ProfileRow>()
    const inviterName = profileRow?.display_name ?? null

    // Look up org name
    type OrgRow = { name: string }
    const orgRow = await env.DB.prepare(
      `SELECT name FROM organization WHERE id = ?`,
    )
      .bind(membership.orgId)
      .first<OrgRow>()
    const orgName = orgRow?.name ?? 'the organization'

    const token = generateToken()
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO staff_invitation (id, org_id, staff_member_id, email, token, invited_by, expires_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).bind(crypto.randomUUID(), membership.orgId, data.staffMemberId, staffRow.email, token, membership.userId, expiresAt, now),
      env.DB.prepare(
        `UPDATE staff_member SET status = 'pending', updated_at = ? WHERE id = ?`,
      ).bind(now, data.staffMemberId),
    ])

    await sendInvitationEmail(staffRow.email, token, orgName, inviterName, env.RESEND_API_KEY)

    await writeAuditLog(env, {
      orgId: membership.orgId,
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'invitation_sent',
      metadata: { email: staffRow.email },
    })

    return { success: true }
  })

// ---------------------------------------------------------------------------
// cancelInvitationServerFn
// ---------------------------------------------------------------------------

type CancelInviteOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_PENDING_INVITATION' }

export const cancelInvitationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: InvitationActionInput) => d)
  .handler(async (ctx): Promise<CancelInviteOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'invite-members')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type InvRow = { id: string; email: string }
    const invRow = await env.DB.prepare(
      `SELECT id, email FROM staff_invitation
       WHERE staff_member_id = ? AND org_id = ? AND status = 'pending'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<InvRow>()

    if (!invRow) {
      // Verify staff member exists in org
      type StaffRow = { id: string }
      const staffRow = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE id = ? AND org_id = ?`,
      )
        .bind(data.staffMemberId, membership.orgId)
        .first<StaffRow>()
      if (!staffRow) return { success: false, error: 'NOT_FOUND' }
      return { success: false, error: 'NO_PENDING_INVITATION' }
    }

    const now = new Date().toISOString()

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE staff_invitation SET status = 'cancelled' WHERE id = ?`,
      ).bind(invRow.id),
      env.DB.prepare(
        `UPDATE staff_member SET status = 'roster_only', updated_at = ? WHERE id = ?`,
      ).bind(now, data.staffMemberId),
    ])

    await writeAuditLog(env, {
      orgId: membership.orgId,
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'invitation_cancelled',
      metadata: { email: invRow.email },
    })

    return { success: true }
  })

// ---------------------------------------------------------------------------
// resendInvitationServerFn
// ---------------------------------------------------------------------------

export const resendInvitationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: InvitationActionInput) => d)
  .handler(async (ctx): Promise<CancelInviteOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'invite-members')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type InvRow = { id: string; email: string }
    const invRow = await env.DB.prepare(
      `SELECT id, email FROM staff_invitation
       WHERE staff_member_id = ? AND org_id = ? AND status = 'pending'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<InvRow>()

    if (!invRow) {
      type StaffRow = { id: string }
      const staffRow = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE id = ? AND org_id = ?`,
      )
        .bind(data.staffMemberId, membership.orgId)
        .first<StaffRow>()
      if (!staffRow) return { success: false, error: 'NOT_FOUND' }
      return { success: false, error: 'NO_PENDING_INVITATION' }
    }

    // Look up org name and inviter name
    type OrgRow = { name: string }
    const orgRow = await env.DB.prepare(`SELECT name FROM organization WHERE id = ?`)
      .bind(membership.orgId)
      .first<OrgRow>()
    const orgName = orgRow?.name ?? 'the organization'

    type ProfileRow = { display_name: string | null }
    const profileRow = await env.DB.prepare(`SELECT display_name FROM user_profile WHERE user_id = ?`)
      .bind(membership.userId)
      .first<ProfileRow>()
    const inviterName = profileRow?.display_name ?? null

    const newToken = generateToken()
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await env.DB.batch([
      env.DB.prepare(`UPDATE staff_invitation SET status = 'cancelled' WHERE id = ?`).bind(invRow.id),
      env.DB.prepare(
        `INSERT INTO staff_invitation (id, org_id, staff_member_id, email, token, invited_by, expires_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).bind(crypto.randomUUID(), membership.orgId, data.staffMemberId, invRow.email, newToken, membership.userId, expiresAt, now),
    ])

    await sendInvitationEmail(invRow.email, newToken, orgName, inviterName, env.RESEND_API_KEY)

    await writeAuditLog(env, {
      orgId: membership.orgId,
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'invitation_resent',
      metadata: { email: invRow.email },
    })

    return { success: true }
  })

// ---------------------------------------------------------------------------
// getInvitationByTokenServerFn (public)
// ---------------------------------------------------------------------------

type GetInvitationOutput =
  | { success: true; invitation: InvitationView }
  | { success: false; error: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' }

export const getInvitationByTokenServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetInvitationInput) => d)
  .handler(async (ctx): Promise<GetInvitationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    type InvRow = {
      token: string
      email: string
      status: string
      expires_at: string
      org_id: string
      org_name: string
      org_slug: string
      staff_role: string
      invited_by: string | null
      inviter_name: string | null
    }

    const row = await env.DB.prepare(
      `SELECT i.token, i.email, i.status, i.expires_at,
              o.id AS org_id, o.name AS org_name, o.slug AS org_slug,
              sm.role AS staff_role,
              i.invited_by,
              p.display_name AS inviter_name
       FROM staff_invitation i
       JOIN organization o ON o.id = i.org_id
       JOIN staff_member sm ON sm.id = i.staff_member_id
       LEFT JOIN user_profile p ON p.user_id = i.invited_by
       WHERE i.token = ?`,
    )
      .bind(data.token)
      .first<InvRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    if (row.status === 'accepted') return { success: false, error: 'ALREADY_USED' }
    if (row.status === 'cancelled') return { success: false, error: 'ALREADY_USED' }
    if (new Date(row.expires_at) < new Date()) return { success: false, error: 'EXPIRED' }

    return {
      success: true,
      invitation: {
        token: row.token,
        orgName: row.org_name,
        orgSlug: row.org_slug,
        email: row.email,
        role: row.staff_role as OrgRole,
        inviterName: row.inviter_name,
        expiresAt: row.expires_at,
      },
    }
  })

// ---------------------------------------------------------------------------
// acceptInvitationServerFn (public)
// ---------------------------------------------------------------------------

type AcceptInvitationOutput =
  | { success: true; orgSlug: string }
  | { success: false; error: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'VALIDATION_ERROR' | 'LOGIN_REQUIRED' }

export const acceptInvitationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: AcceptInvitationInput) => d)
  .handler(async (ctx): Promise<AcceptInvitationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const now = new Date().toISOString()

    // Load invitation
    type InvRow = {
      id: string
      status: string
      expires_at: string
      email: string
      staff_member_id: string
      org_id: string
      org_slug: string
      staff_role: string
    }

    const inv = await env.DB.prepare(
      `SELECT i.id, i.status, i.expires_at, i.email, i.staff_member_id,
              i.org_id, o.slug AS org_slug, sm.role AS staff_role
       FROM staff_invitation i
       JOIN organization o ON o.id = i.org_id
       JOIN staff_member sm ON sm.id = i.staff_member_id
       WHERE i.token = ?`,
    )
      .bind(data.token)
      .first<InvRow>()

    if (!inv) return { success: false, error: 'NOT_FOUND' }
    if (inv.status !== 'pending') return { success: false, error: 'ALREADY_USED' }
    if (new Date(inv.expires_at) < new Date()) return { success: false, error: 'EXPIRED' }

    // Check if caller is already logged in
    const sessionToken = getCookie('session')
    let loggedInUserId: string | null = null
    let loggedInEmail: string | null = null

    if (sessionToken) {
      type SessionRow = { user_id: string; email: string }
      const sessionRow = await env.DB.prepare(
        `SELECT s.user_id, u.email FROM session s JOIN user u ON u.id = s.user_id
         WHERE s.session_token = ? AND s.expires_at > ?`,
      )
        .bind(sessionToken, now)
        .first<SessionRow>()
      if (sessionRow) {
        loggedInUserId = sessionRow.user_id
        loggedInEmail = sessionRow.email
      }
    }

    // Case 2: Logged-in user with matching email — link their account
    if (loggedInUserId && loggedInEmail === inv.email) {
      type ExistingMember = { id: string }
      const existingMember = await env.DB.prepare(
        `SELECT id FROM org_membership WHERE org_id = ? AND user_id = ? AND status = 'active'`,
      )
        .bind(inv.org_id, loggedInUserId)
        .first<ExistingMember>()

      if (!existingMember) {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO org_membership (id, org_id, user_id, role, status, joined_at)
             VALUES (?, ?, ?, ?, 'active', ?)`,
          ).bind(crypto.randomUUID(), inv.org_id, loggedInUserId, inv.staff_role, now),
          env.DB.prepare(
            `UPDATE staff_member SET status = 'active', user_id = ?, updated_at = ? WHERE id = ?`,
          ).bind(loggedInUserId, now, inv.staff_member_id),
          env.DB.prepare(
            `UPDATE staff_invitation SET status = 'accepted' WHERE id = ?`,
          ).bind(inv.id),
        ])
      } else {
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE staff_member SET status = 'active', user_id = ?, updated_at = ? WHERE id = ?`,
          ).bind(loggedInUserId, now, inv.staff_member_id),
          env.DB.prepare(
            `UPDATE staff_invitation SET status = 'accepted' WHERE id = ?`,
          ).bind(inv.id),
        ])
      }

      await writeAuditLog(env, {
        orgId: inv.org_id,
        staffMemberId: inv.staff_member_id,
        performedBy: loggedInUserId,
        action: 'member_linked',
        metadata: { email: inv.email },
      })

      return { success: true, orgSlug: inv.org_slug }
    }

    // Case 3: Not logged in but account with this email exists → prompt login
    if (!loggedInUserId) {
      type UserRow = { id: string }
      const existingUser = await env.DB.prepare(`SELECT id FROM user WHERE email = ?`)
        .bind(inv.email)
        .first<UserRow>()

      if (existingUser && !data.name && !data.password) {
        return { success: false, error: 'LOGIN_REQUIRED' }
      }
    }

    // Case 1: New account registration
    if (!data.name?.trim() || !data.password) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }
    if (data.password.length < 8) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const passwordHash = await hashPassword(data.password)
    const newUserId = crypto.randomUUID()
    const newSessionToken = generateToken()
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user (id, email, password_hash, verified, created_at)
         VALUES (?, ?, ?, 1, ?)`,
      ).bind(newUserId, inv.email, passwordHash, now),
      env.DB.prepare(
        `INSERT INTO user_profile (user_id, display_name, updated_at) VALUES (?, ?, ?)`,
      ).bind(newUserId, data.name.trim(), now),
      env.DB.prepare(
        `INSERT INTO org_membership (id, org_id, user_id, role, status, joined_at)
         VALUES (?, ?, ?, ?, 'active', ?)`,
      ).bind(crypto.randomUUID(), inv.org_id, newUserId, inv.staff_role, now),
      env.DB.prepare(
        `UPDATE staff_member SET status = 'active', user_id = ?, updated_at = ? WHERE id = ?`,
      ).bind(newUserId, now, inv.staff_member_id),
      env.DB.prepare(
        `UPDATE staff_invitation SET status = 'accepted' WHERE id = ?`,
      ).bind(inv.id),
      env.DB.prepare(
        `INSERT INTO session (id, user_id, session_token, created_at, last_activity_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(sessionId, newUserId, newSessionToken, now, now, expiresAt),
    ])

    setCookie('session', newSessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    })

    await writeAuditLog(env, {
      orgId: inv.org_id,
      staffMemberId: inv.staff_member_id,
      performedBy: newUserId,
      action: 'invitation_accepted',
      metadata: { email: inv.email },
    })

    return { success: true, orgSlug: inv.org_slug }
  })

// ---------------------------------------------------------------------------
// changeStaffRoleServerFn
// ---------------------------------------------------------------------------

type ChangeRoleOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_ROLE' | 'OWNER_TRANSFER_REQUIRED' }

const VALID_ROLES: OrgRole[] = ['owner', 'admin', 'manager', 'employee', 'payroll_hr']

export const changeStaffRoleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ChangeStaffRoleInput) => d)
  .handler(async (ctx): Promise<ChangeRoleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'assign-roles')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    if (!VALID_ROLES.includes(data.newRole)) {
      return { success: false, error: 'INVALID_ROLE' }
    }

    type StaffRow = { role: string; status: string; user_id: string | null }
    const staffRow = await env.DB.prepare(
      `SELECT role, status, user_id FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()

    if (!staffRow) return { success: false, error: 'NOT_FOUND' }

    // Prevent changing owner role without transfer
    if (staffRow.role === 'owner' && data.newRole !== 'owner') {
      return { success: false, error: 'OWNER_TRANSFER_REQUIRED' }
    }

    const now = new Date().toISOString()
    const oldRole = staffRow.role as OrgRole

    const stmts: D1PreparedStatement[] = [
      env.DB.prepare(
        `UPDATE staff_member SET role = ?, updated_at = ? WHERE id = ?`,
      ).bind(data.newRole, now, data.staffMemberId),
    ]

    // If active member, also update org_membership
    if (staffRow.status === 'active' && staffRow.user_id) {
      stmts.push(
        env.DB.prepare(
          `UPDATE org_membership SET role = ? WHERE user_id = ? AND org_id = ? AND status = 'active'`,
        ).bind(data.newRole, staffRow.user_id, membership.orgId),
      )
    }

    await env.DB.batch(stmts)

    // Invalidate sessions immediately
    if (staffRow.user_id) {
      await invalidateUserSessions(env, staffRow.user_id)
    }

    await writeAuditLog(env, {
      orgId: membership.orgId,
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'role_changed',
      metadata: { from: oldRole, to: data.newRole },
    })

    return { success: true }
  })

// ---------------------------------------------------------------------------
// removeStaffMemberServerFn
// ---------------------------------------------------------------------------

type RemoveStaffOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'LAST_OWNER' }

export const removeStaffMemberServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: RemoveStaffMemberInput) => d)
  .handler(async (ctx): Promise<RemoveStaffOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'remove-members')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    type StaffRow = { role: string; status: string; user_id: string | null; name: string }
    const staffRow = await env.DB.prepare(
      `SELECT role, status, user_id, name FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()

    if (!staffRow) return { success: false, error: 'NOT_FOUND' }

    // Prevent removing the last owner
    if (staffRow.role === 'owner') {
      type CountRow = { count: number }
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM staff_member
         WHERE org_id = ? AND role = 'owner' AND status = 'active'`,
      )
        .bind(membership.orgId)
        .first<CountRow>()
      if ((countRow?.count ?? 0) <= 1) {
        return { success: false, error: 'LAST_OWNER' }
      }
    }

    const now = new Date().toISOString()
    const stmts: D1PreparedStatement[] = [
      env.DB.prepare(
        `UPDATE staff_member SET status = 'removed', updated_at = ? WHERE id = ?`,
      ).bind(now, data.staffMemberId),
    ]

    // Deactivate org_membership for active members
    if (staffRow.status === 'active' && staffRow.user_id) {
      stmts.push(
        env.DB.prepare(
          `UPDATE org_membership SET status = 'inactive' WHERE user_id = ? AND org_id = ? AND status = 'active'`,
        ).bind(staffRow.user_id, membership.orgId),
      )
    }

    // Cancel pending invitation
    stmts.push(
      env.DB.prepare(
        `UPDATE staff_invitation SET status = 'cancelled' WHERE staff_member_id = ? AND status = 'pending'`,
      ).bind(data.staffMemberId),
    )

    await env.DB.batch(stmts)

    // Invalidate sessions immediately for account holders
    if (staffRow.user_id) {
      await invalidateUserSessions(env, staffRow.user_id)
    }

    await writeAuditLog(env, {
      orgId: membership.orgId,
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'member_removed',
      metadata: { name: staffRow.name },
    })

    return { success: true }
  })

// ---------------------------------------------------------------------------
// getStaffAuditLogServerFn
// ---------------------------------------------------------------------------

type GetAuditLogOutput =
  | { success: true; entries: StaffAuditEntry[]; total: number }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' }

export const getStaffAuditLogServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetStaffAuditLogInput) => d)
  .handler(async (ctx): Promise<GetAuditLogOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'assign-roles')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = data.offset ?? 0

    type CountRow = { total: number }
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM staff_audit_log WHERE org_id = ?`,
    )
      .bind(membership.orgId)
      .first<CountRow>()
    const total = countRow?.total ?? 0

    type LogRow = {
      id: string
      staff_member_id: string | null
      staff_member_name: string | null
      performed_by: string | null
      performer_name: string | null
      action: string
      metadata: string | null
      created_at: string
    }

    const rows = await env.DB.prepare(
      `SELECT l.id, l.staff_member_id, sm.name AS staff_member_name,
              l.performed_by, p.display_name AS performer_name,
              l.action, l.metadata, l.created_at
       FROM staff_audit_log l
       LEFT JOIN staff_member sm ON sm.id = l.staff_member_id
       LEFT JOIN user_profile p ON p.user_id = l.performed_by
       WHERE l.org_id = ?
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(membership.orgId, limit, offset)
      .all<LogRow>()

    const entries: StaffAuditEntry[] = (rows.results ?? []).map((r) => ({
      id: r.id,
      staffMemberId: r.staff_member_id,
      staffMemberName: r.staff_member_name,
      performedByUserId: r.performed_by,
      performedByName: r.performer_name,
      action: r.action as StaffAuditAction,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, string>) : null,
      createdAt: r.created_at,
    }))

    return { success: true, entries, total }
  })
