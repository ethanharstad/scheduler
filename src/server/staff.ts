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
  StaffAuditEntry,
  StaffMemberView,
  UpdateStaffMemberInput,
} from '@/lib/staff.types'
import { requireOrgMembership } from '@/server/_helpers'
import { getOrgStub } from '@/server/_do-helpers'
import { sendEmail } from '@/server/_email'

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
  env: Cloudflare.Env,
): Promise<void> {
  const origin = getRequestOrigin()
  const url = `${origin}/join/${token}`
  const fromLine = inviterName ? `${inviterName} has invited` : 'You have been invited'
  await sendEmail(env, {
    to,
    subject: `You've been invited to join ${orgName} on Scheduler`,
    html: `<p>${fromLine} you to join <strong>${orgName}</strong> on Scheduler.</p>
           <p><a href="${url}">Accept invitation</a></p>
           <p>This link expires in 7 days.</p>`,
  })
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

    const stub = getOrgStub(env, membership.orgId)
    const members = await stub.listStaff()
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

    const stub = getOrgStub(env, membership.orgId)

    // Check for duplicate email within org (via DO)
    if (email) {
      const existing = await stub.queryOne(
        `SELECT id FROM staff_member WHERE email = ? AND status != 'removed'`,
        email,
      ) as { id: string } | null
      if (existing) return { success: false, error: 'DUPLICATE_EMAIL' }
    }

    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    // Check if email matches an existing registered user (user table stays in D1)
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
        // Check they're not already an active member (org_membership stays in D1)
        type MemberRow = { id: string }
        const existingMembership = await env.DB.prepare(
          `SELECT id FROM org_membership WHERE org_id = ? AND user_id = ? AND status = 'active'`,
        )
          .bind(membership.orgId, userRow.id)
          .first<MemberRow>()

        if (!existingMembership) {
          userId = userRow.id
          status = 'active'
          // Create org_membership for the auto-linked user (D1)
          await env.DB.prepare(
            `INSERT INTO org_membership (id, org_id, user_id, role, status, joined_at)
             VALUES (?, ?, ?, ?, 'active', ?)`,
          )
            .bind(crypto.randomUUID(), membership.orgId, userId, data.role, now)
            .run()
        }
      }
    }

    // Write staff member + audit log to DO
    await stub.addStaff({
      id,
      name,
      email,
      phone,
      role: data.role,
      userId,
      addedBy: membership.userId,
    })
    await stub.writeAuditLog({
      staffMemberId: id,
      performedBy: membership.userId,
      action: 'member_added',
      metadata: { name, ...(email ? { email } : {}) },
    })
    if (userId) {
      await stub.upsertMembership({
        id: crypto.randomUUID(),
        userId,
        role: data.role,
        joinedAt: now,
      })
    }

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
// updateStaffMemberServerFn
// ---------------------------------------------------------------------------

type UpdateStaffMemberOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'DUPLICATE_EMAIL' }

export const updateStaffMemberServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateStaffMemberInput) => d)
  .handler(async (ctx): Promise<UpdateStaffMemberOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'invite-members')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const name = data.name !== undefined ? data.name.trim() : undefined
    if (name !== undefined && !name) return { success: false, error: 'VALIDATION_ERROR' }

    const email = data.email !== undefined
      ? (data.email?.trim().toLowerCase() || null)
      : undefined
    const phone = data.phone !== undefined
      ? (data.phone?.trim() || null)
      : undefined

    const stub = getOrgStub(env, membership.orgId)

    type StaffRow = { name: string; email: string | null; phone: string | null; status: string }
    const existing = await stub.queryOne(
      `SELECT name, email, phone, status FROM staff_member WHERE id = ? AND status != 'removed'`,
      data.staffMemberId,
    ) as StaffRow | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    // Check for duplicate email if it's changing
    if (email !== undefined && email !== existing.email && email !== null) {
      const dup = await stub.queryOne(
        `SELECT id FROM staff_member WHERE email = ? AND id != ? AND status != 'removed'`,
        email,
        data.staffMemberId,
      ) as { id: string } | null
      if (dup) return { success: false, error: 'DUPLICATE_EMAIL' }
    }

    const fields: { name?: string; email?: string | null; phone?: string | null } = {}
    if (name !== undefined) fields.name = name
    if (email !== undefined) fields.email = email
    if (phone !== undefined) fields.phone = phone

    if (Object.keys(fields).length === 0) return { success: true }

    await stub.updateStaffDetails(data.staffMemberId, fields)

    const changes: Record<string, string> = {}
    if (name !== undefined && name !== existing.name) changes.name = name
    if (email !== undefined && email !== existing.email) changes.email = email ?? ''
    if (phone !== undefined && phone !== existing.phone) changes.phone = phone ?? ''

    await stub.writeAuditLog({
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'member_updated',
      metadata: changes,
    })

    return { success: true }
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

    const stub = getOrgStub(env, membership.orgId)

    type StaffRow = { email: string | null; status: string; name: string }
    const staffRow = await stub.queryOne(
      `SELECT email, status, name FROM staff_member WHERE id = ?`,
      data.staffMemberId,
    ) as StaffRow | null

    if (!staffRow) return { success: false, error: 'NOT_FOUND' }
    if (!staffRow.email) return { success: false, error: 'NO_EMAIL' }
    if (staffRow.status === 'active') return { success: false, error: 'ALREADY_ACTIVE' }
    if (staffRow.status === 'pending') return { success: false, error: 'ALREADY_PENDING' }

    // Look up inviter display name (user_profile stays in D1)
    type ProfileRow = { display_name: string | null }
    const profileRow = await env.DB.prepare(
      `SELECT display_name FROM user_profile WHERE user_id = ?`,
    )
      .bind(membership.userId)
      .first<ProfileRow>()
    const inviterName = profileRow?.display_name ?? null

    // Look up org name (organization stays in D1)
    type OrgRow = { name: string }
    const orgRow = await env.DB.prepare(
      `SELECT name FROM organization WHERE id = ?`,
    )
      .bind(membership.orgId)
      .first<OrgRow>()
    const orgName = orgRow?.name ?? 'the organization'

    const token = generateToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Write invitation + update staff status in DO
    await stub.createInvitation({
      staffMemberId: data.staffMemberId,
      email: staffRow.email,
      token,
      invitedBy: membership.userId,
      expiresAt,
    })
    // D1 index so public token lookup can find the right org DO
    await env.DB.prepare(
      `INSERT INTO invitation_token_index (token, org_id) VALUES (?, ?)`,
    )
      .bind(token, membership.orgId)
      .run()
    await stub.writeAuditLog({
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'invitation_sent',
      metadata: { email: staffRow.email },
    })

    await sendInvitationEmail(staffRow.email, token, orgName, inviterName, env)

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

    const stub = getOrgStub(env, membership.orgId)

    type CancelInvRow = { id: string; email: string; token: string }
    const invRow = await stub.queryOne(
      `SELECT id, email, token FROM staff_invitation
       WHERE staff_member_id = ? AND status = 'pending'`,
      data.staffMemberId,
    ) as CancelInvRow | null

    if (!invRow) {
      // Verify staff member exists in org
      const staffRow = await stub.queryOne(
        `SELECT id FROM staff_member WHERE id = ?`,
        data.staffMemberId,
      ) as { id: string } | null
      if (!staffRow) return { success: false, error: 'NOT_FOUND' }
      return { success: false, error: 'NO_PENDING_INVITATION' }
    }

    await stub.cancelInvitation(data.staffMemberId)
    // Clean up D1 token index
    await env.DB.prepare(`DELETE FROM invitation_token_index WHERE token = ?`)
      .bind(invRow.token)
      .run()
    await stub.writeAuditLog({
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

    const stub = getOrgStub(env, membership.orgId)

    type InvRow = { id: string; email: string; token: string }
    const invRow = await stub.queryOne(
      `SELECT id, email, token FROM staff_invitation
       WHERE staff_member_id = ? AND status = 'pending'`,
      data.staffMemberId,
    ) as InvRow | null

    if (!invRow) {
      const staffRow = await stub.queryOne(
        `SELECT id FROM staff_member WHERE id = ?`,
        data.staffMemberId,
      ) as { id: string } | null
      if (!staffRow) return { success: false, error: 'NOT_FOUND' }
      return { success: false, error: 'NO_PENDING_INVITATION' }
    }

    // Look up org name (organization stays in D1)
    type OrgRow = { name: string }
    const orgRow = await env.DB.prepare(`SELECT name FROM organization WHERE id = ?`)
      .bind(membership.orgId)
      .first<OrgRow>()
    const orgName = orgRow?.name ?? 'the organization'

    // Look up inviter name (user_profile stays in D1)
    type ProfileRow = { display_name: string | null }
    const profileRow = await env.DB.prepare(`SELECT display_name FROM user_profile WHERE user_id = ?`)
      .bind(membership.userId)
      .first<ProfileRow>()
    const inviterName = profileRow?.display_name ?? null

    const newToken = generateToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Update D1 token index: remove old token, add new one
    await env.DB.prepare(`DELETE FROM invitation_token_index WHERE token = ?`)
      .bind(invRow.token)
      .run()
    await env.DB.prepare(`INSERT INTO invitation_token_index (token, org_id) VALUES (?, ?)`)
      .bind(newToken, membership.orgId)
      .run()

    // Replace invitation in DO
    await stub.replaceInvitation({
      staffMemberId: data.staffMemberId,
      email: invRow.email,
      token: newToken,
      invitedBy: membership.userId,
      expiresAt,
    })
    await stub.writeAuditLog({
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'invitation_resent',
      metadata: { email: invRow.email },
    })

    await sendInvitationEmail(invRow.email, newToken, orgName, inviterName, env)

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

    // Look up org_id from D1 index, then query DO for full invitation data
    type IndexRow = { org_id: string }
    const indexRow = await env.DB.prepare(
      `SELECT org_id FROM invitation_token_index WHERE token = ?`,
    )
      .bind(data.token)
      .first<IndexRow>()

    if (!indexRow) return { success: false, error: 'NOT_FOUND' }

    const stub = getOrgStub(env, indexRow.org_id)

    type DOInvRow = {
      token: string
      email: string
      status: string
      expires_at: string
      staff_member_id: string
      invited_by: string | null
    }
    const inv = await stub.queryOne(
      `SELECT token, email, status, expires_at, staff_member_id, invited_by
       FROM staff_invitation WHERE token = ?`,
      data.token,
    ) as DOInvRow | null

    if (!inv) return { success: false, error: 'NOT_FOUND' }
    if (inv.status === 'accepted' || inv.status === 'cancelled') return { success: false, error: 'ALREADY_USED' }
    if (new Date(inv.expires_at) < new Date()) return { success: false, error: 'EXPIRED' }

    // Get staff role from DO
    type StaffRow = { role: string }
    const staffRow = await stub.queryOne(
      `SELECT role FROM staff_member WHERE id = ?`,
      inv.staff_member_id,
    ) as StaffRow | null

    // Get org name + slug from D1 (still there)
    type OrgRow = { name: string; slug: string }
    const orgRow = await env.DB.prepare(
      `SELECT name, slug FROM organization WHERE id = ?`,
    )
      .bind(indexRow.org_id)
      .first<OrgRow>()

    // Get inviter name from D1 user_profile
    let inviterName: string | null = null
    if (inv.invited_by) {
      type ProfileRow = { display_name: string }
      const profileRow = await env.DB.prepare(
        `SELECT display_name FROM user_profile WHERE user_id = ?`,
      )
        .bind(inv.invited_by)
        .first<ProfileRow>()
      inviterName = profileRow?.display_name ?? null
    }

    return {
      success: true,
      invitation: {
        token: inv.token,
        orgName: orgRow?.name ?? '',
        orgSlug: orgRow?.slug ?? '',
        email: inv.email,
        role: (staffRow?.role ?? 'employee') as OrgRole,
        inviterName,
        expiresAt: inv.expires_at,
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

    // Look up org_id from D1 index, then query DO for invitation data
    type IndexRow = { org_id: string }
    const indexRow = await env.DB.prepare(
      `SELECT org_id FROM invitation_token_index WHERE token = ?`,
    )
      .bind(data.token)
      .first<IndexRow>()

    if (!indexRow) return { success: false, error: 'NOT_FOUND' }

    const stub = getOrgStub(env, indexRow.org_id)

    type DOInvRow = {
      id: string
      status: string
      expires_at: string
      email: string
      staff_member_id: string
    }
    const doInv = await stub.queryOne(
      `SELECT id, status, expires_at, email, staff_member_id
       FROM staff_invitation WHERE token = ?`,
      data.token,
    ) as DOInvRow | null

    if (!doInv) return { success: false, error: 'NOT_FOUND' }
    if (doInv.status !== 'pending') return { success: false, error: 'ALREADY_USED' }
    if (new Date(doInv.expires_at) < new Date()) return { success: false, error: 'EXPIRED' }

    // Get org slug from D1
    type OrgRow = { slug: string }
    const orgRow = await env.DB.prepare(
      `SELECT slug FROM organization WHERE id = ?`,
    )
      .bind(indexRow.org_id)
      .first<OrgRow>()
    const orgSlug = orgRow?.slug ?? ''

    // Get staff role from DO
    type StaffRow = { role: string }
    const staffRoleRow = await stub.queryOne(
      `SELECT role FROM staff_member WHERE id = ?`,
      doInv.staff_member_id,
    ) as StaffRow | null
    const staffRole = staffRoleRow?.role ?? 'employee'

    // Build a compat object for the rest of the function
    const inv = {
      id: doInv.id,
      status: doInv.status,
      expires_at: doInv.expires_at,
      email: doInv.email,
      staff_member_id: doInv.staff_member_id,
      org_id: indexRow.org_id,
      org_slug: orgSlug,
      staff_role: staffRole,
    }

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
      // org_membership stays in D1
      type ExistingMember = { id: string }
      const existingMember = await env.DB.prepare(
        `SELECT id FROM org_membership WHERE org_id = ? AND user_id = ? AND status = 'active'`,
      )
        .bind(inv.org_id, loggedInUserId)
        .first<ExistingMember>()

      if (!existingMember) {
        await env.DB.prepare(
          `INSERT INTO org_membership (id, org_id, user_id, role, status, joined_at)
           VALUES (?, ?, ?, ?, 'active', ?)`,
        )
          .bind(crypto.randomUUID(), inv.org_id, loggedInUserId, inv.staff_role, now)
          .run()
      }

      // Accept invitation + update staff in DO (stub already defined above)
      await stub.acceptInvitation({ token: data.token, userId: loggedInUserId })
      await stub.upsertMembership({
        id: crypto.randomUUID(),
        userId: loggedInUserId,
        role: inv.staff_role as OrgRole,
        joinedAt: now,
      })
      await stub.writeAuditLog({
        staffMemberId: inv.staff_member_id,
        performedBy: loggedInUserId,
        action: 'member_linked',
        metadata: { email: inv.email },
      })

      // Clean up token index
      await env.DB.prepare(`DELETE FROM invitation_token_index WHERE token = ?`).bind(data.token).run()
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

    // D1: user, user_profile, org_membership, session (cross-org tables)
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

    // DO: accept invitation + update staff + audit log (stub already defined above)
    await stub.acceptInvitation({ token: data.token, userId: newUserId })
    await stub.upsertMembership({
      id: crypto.randomUUID(),
      userId: newUserId,
      role: inv.staff_role as OrgRole,
      joinedAt: now,
    })
    await stub.writeAuditLog({
      staffMemberId: inv.staff_member_id,
      performedBy: newUserId,
      action: 'invitation_accepted',
      metadata: { email: inv.email },
    })

    // Clean up token index
    await env.DB.prepare(`DELETE FROM invitation_token_index WHERE token = ?`).bind(data.token).run()
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

    const stub = getOrgStub(env, membership.orgId)

    type StaffRow = { role: string; status: string; user_id: string | null }
    const staffRow = await stub.queryOne(
      `SELECT role, status, user_id FROM staff_member WHERE id = ? AND status != 'removed'`,
      data.staffMemberId,
    ) as StaffRow | null

    if (!staffRow) return { success: false, error: 'NOT_FOUND' }

    // Prevent changing owner role without transfer
    if (staffRow.role === 'owner' && data.newRole !== 'owner') {
      return { success: false, error: 'OWNER_TRANSFER_REQUIRED' }
    }

    const oldRole = staffRow.role as OrgRole

    // Update role in DO
    await stub.updateStaffRole(data.staffMemberId, data.newRole)
    if (staffRow.status === 'active' && staffRow.user_id) {
      await stub.updateMembershipRole(staffRow.user_id, data.newRole)
    }
    await stub.writeAuditLog({
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'role_changed',
      metadata: { from: oldRole, to: data.newRole },
    })

    // org_membership update stays in D1
    if (staffRow.status === 'active' && staffRow.user_id) {
      await env.DB.prepare(
        `UPDATE org_membership SET role = ? WHERE user_id = ? AND org_id = ? AND status = 'active'`,
      )
        .bind(data.newRole, staffRow.user_id, membership.orgId)
        .run()
    }

    // Invalidate sessions immediately (session table stays in D1)
    if (staffRow.user_id) {
      await invalidateUserSessions(env, staffRow.user_id)
    }

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

    const stub = getOrgStub(env, membership.orgId)

    type StaffRow = { role: string; status: string; user_id: string | null; name: string }
    const staffRow = await stub.queryOne(
      `SELECT role, status, user_id, name FROM staff_member WHERE id = ? AND status != 'removed'`,
      data.staffMemberId,
    ) as StaffRow | null

    if (!staffRow) return { success: false, error: 'NOT_FOUND' }

    // Prevent removing the last owner
    if (staffRow.role === 'owner') {
      type CountRow = { count: number }
      const countRow = await stub.queryOne(
        `SELECT COUNT(*) AS count FROM staff_member
         WHERE role = 'owner' AND status = 'active'`,
      ) as CountRow | null
      if ((countRow?.count ?? 0) <= 1) {
        return { success: false, error: 'LAST_OWNER' }
      }
    }

    // Cancel active trades before removing staff
    const { cancelActiveTradesForStaffMember } = await import('@/server/trades')
    await cancelActiveTradesForStaffMember(stub, data.staffMemberId)

    // Remove staff + cancel invitations in DO
    await stub.removeStaffMember(data.staffMemberId)
    if (staffRow.status === 'active' && staffRow.user_id) {
      await stub.deactivateMembership(staffRow.user_id)
    }
    await stub.writeAuditLog({
      staffMemberId: data.staffMemberId,
      performedBy: membership.userId,
      action: 'member_removed',
      metadata: { name: staffRow.name },
    })

    // Deactivate org_membership in D1 for active members
    if (staffRow.status === 'active' && staffRow.user_id) {
      await env.DB.prepare(
        `UPDATE org_membership SET status = 'inactive' WHERE user_id = ? AND org_id = ? AND status = 'active'`,
      )
        .bind(staffRow.user_id, membership.orgId)
        .run()
    }

    // Invalidate sessions immediately for account holders (session table stays in D1)
    if (staffRow.user_id) {
      await invalidateUserSessions(env, staffRow.user_id)
    }

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

    const stub = getOrgStub(env, membership.orgId)
    const result = await stub.getAuditLog(limit, offset)

    // Enrich performedByName from D1 user_profile (DO doesn't have this table)
    const performerIds = [
      ...new Set(
        result.entries
          .map((e) => e.performedByUserId)
          .filter((id): id is string => id !== null),
      ),
    ]
    const nameMap = new Map<string, string>()
    if (performerIds.length > 0) {
      const placeholders = performerIds.map(() => '?').join(',')
      type ProfileRow = { user_id: string; display_name: string }
      const profileRows = await env.DB.prepare(
        `SELECT user_id, display_name FROM user_profile WHERE user_id IN (${placeholders})`,
      )
        .bind(...performerIds)
        .all<ProfileRow>()
      for (const row of profileRows.results ?? []) {
        nameMap.set(row.user_id, row.display_name)
      }
    }

    const entries = result.entries.map((e) => ({
      ...e,
      performedByName: e.performedByUserId
        ? (nameMap.get(e.performedByUserId) ?? null)
        : null,
    }))

    return { success: true, entries, total: result.total }
  })
