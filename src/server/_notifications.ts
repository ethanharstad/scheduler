// ---------------------------------------------------------------------------
// Internal notification creation helper (imported by other server modules)
// ---------------------------------------------------------------------------

import { sendEmail } from '@/server/_email'
import { getOrgStub } from '@/server/_do-helpers'
import type {
  CreateNotificationParams,
  NotificationCategory,
} from '@/lib/notification.types'

/**
 * Notify a staff member by their staff_member_id.
 * Resolves the linked user_id; skips if the staff member has no platform account.
 * Best-effort — never throws.
 */
export async function notifyStaffMember(
  env: Cloudflare.Env,
  orgId: string,
  staffMemberId: string,
  category: NotificationCategory,
  params: Omit<CreateNotificationParams, 'userId'>,
): Promise<void> {
  try {
    const stub = getOrgStub(env, orgId)
    type StaffRow = { user_id: string | null }
    const staff = await stub.queryOne<StaffRow>(
      `SELECT user_id FROM staff_member WHERE id = ? AND status != 'removed'`,
      staffMemberId,
    )
    if (!staff?.user_id) return
    await createNotification(env, orgId, category, { ...params, userId: staff.user_id })
  } catch (err) {
    console.error(`[notifications] Failed to notify staff ${staffMemberId}:`, err)
  }
}

/**
 * Create a notification for a user within an org.
 * Always creates an in-app notification. Checks user preferences
 * and dispatches to email if enabled. Best-effort — never throws.
 */
export async function createNotification(
  env: Cloudflare.Env,
  orgId: string,
  category: NotificationCategory,
  params: CreateNotificationParams,
): Promise<void> {
  try {
    await _createNotification(env, orgId, category, params)
  } catch (err) {
    console.error(`[notifications] Failed to create notification for ${params.userId}:`, err)
  }
}

async function _createNotification(
  env: Cloudflare.Env,
  orgId: string,
  category: NotificationCategory,
  params: CreateNotificationParams,
): Promise<void> {
  const stub = getOrgStub(env, orgId)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // Always create in-app notification
  await stub.execute(
    `INSERT INTO notification (id, user_id, type, title, message, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    id,
    params.userId,
    params.type,
    params.title,
    params.message,
    params.link ?? null,
    now,
  )

  // Check if email channel is requested and enabled
  const channels = params.channels ?? ['in_app']
  if (!channels.includes('email')) return

  // Check user preference for this category
  type PrefRow = { email: number }
  const pref = await stub.queryOne<PrefRow>(
    `SELECT email FROM notification_preference WHERE user_id = ? AND category = ?`,
    params.userId,
    category,
  )
  // Default: email enabled if no preference row exists
  if (pref && pref.email === 0) return

  // Look up user email from D1
  type UserRow = { email: string }
  const user = await env.DB.prepare(`SELECT email FROM user WHERE id = ?`)
    .bind(params.userId)
    .first<UserRow>()
  if (!user?.email) return

  await sendEmail(env, {
    to: user.email,
    subject: params.title,
    html: `<p>${params.message}</p>${params.link ? `<p><a href="${params.link}">View details</a></p>` : ''}`,
  })
}
