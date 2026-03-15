import { createServerFn } from '@tanstack/react-start'
import type {
  ListNotificationsInput,
  ListNotificationsOutput,
  GetUnreadCountInput,
  GetUnreadCountOutput,
  MarkNotificationReadInput,
  MarkNotificationReadOutput,
  MarkAllReadInput,
  MarkAllReadOutput,
  GetNotificationPrefsInput,
  GetNotificationPrefsOutput,
  UpdateNotificationPrefsInput,
  UpdateNotificationPrefsOutput,
  NotificationView,
  NotificationPreferenceView,
  NotificationCategory,
} from '@/lib/notification.types'
import { requireOrgMembership } from '@/server/_helpers'
import { getOrgStub } from '@/server/_do-helpers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_CATEGORIES: NotificationCategory[] = [
  'schedule_change',
  'shift_trade',
  'time_off',
  'cert_expiration',
  'general',
]

type NotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  link: string | null
  is_read: number
  created_at: string
}

function rowToView(r: NotificationRow): NotificationView {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type as NotificationView['type'],
    title: r.title,
    message: r.message,
    link: r.link,
    isRead: r.is_read === 1,
    createdAt: r.created_at,
  }
}

// ---------------------------------------------------------------------------
// listNotificationsServerFn
// ---------------------------------------------------------------------------

export const listNotificationsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListNotificationsInput) => d)
  .handler(async (ctx): Promise<ListNotificationsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    const limit = data.limit ?? 20
    const offset = data.offset ?? 0

    // Lazy cleanup: delete notifications older than 90 days
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString()
    await stub.execute(
      `DELETE FROM notification WHERE user_id = ? AND created_at < ?`,
      membership.userId,
      cutoff,
    )

    const rows = await stub.query<NotificationRow>(
      `SELECT id, user_id, type, title, message, link, is_read, created_at
       FROM notification
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      membership.userId,
      limit,
      offset,
    )

    type CountRow = { cnt: number }
    const countRow = await stub.queryOne<CountRow>(
      `SELECT COUNT(*) as cnt FROM notification WHERE user_id = ? AND is_read = 0`,
      membership.userId,
    )

    return {
      success: true,
      notifications: rows.map(rowToView),
      unreadCount: countRow?.cnt ?? 0,
    }
  })

// ---------------------------------------------------------------------------
// getUnreadCountServerFn
// ---------------------------------------------------------------------------

export const getUnreadCountServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetUnreadCountInput) => d)
  .handler(async (ctx): Promise<GetUnreadCountOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)

    type CountRow = { cnt: number }
    const row = await stub.queryOne<CountRow>(
      `SELECT COUNT(*) as cnt FROM notification WHERE user_id = ? AND is_read = 0`,
      membership.userId,
    )

    return { success: true, count: row?.cnt ?? 0 }
  })

// ---------------------------------------------------------------------------
// markNotificationReadServerFn
// ---------------------------------------------------------------------------

export const markNotificationReadServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: MarkNotificationReadInput) => d)
  .handler(async (ctx): Promise<MarkNotificationReadOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)

    type Row = { id: string }
    const existing = await stub.queryOne<Row>(
      `SELECT id FROM notification WHERE id = ? AND user_id = ?`,
      data.notificationId,
      membership.userId,
    )
    if (!existing) return { success: false, error: 'NOT_FOUND' }

    await stub.execute(
      `UPDATE notification SET is_read = 1 WHERE id = ? AND user_id = ?`,
      data.notificationId,
      membership.userId,
    )

    return { success: true }
  })

// ---------------------------------------------------------------------------
// markAllReadServerFn
// ---------------------------------------------------------------------------

export const markAllReadServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: MarkAllReadInput) => d)
  .handler(async (ctx): Promise<MarkAllReadOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)

    await stub.execute(
      `UPDATE notification SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      membership.userId,
    )

    return { success: true }
  })

// ---------------------------------------------------------------------------
// getNotificationPrefsServerFn
// ---------------------------------------------------------------------------

export const getNotificationPrefsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetNotificationPrefsInput) => d)
  .handler(async (ctx): Promise<GetNotificationPrefsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)

    type PrefRow = { category: string; email: number }
    const rows = await stub.query<PrefRow>(
      `SELECT category, email FROM notification_preference WHERE user_id = ?`,
      membership.userId,
    )

    const prefMap = new Map(rows.map((r) => [r.category, r.email === 1]))

    const preferences: NotificationPreferenceView[] = ALL_CATEGORIES.map((cat) => ({
      category: cat,
      inApp: true,
      email: prefMap.get(cat) ?? true,
    }))

    return { success: true, preferences }
  })

// ---------------------------------------------------------------------------
// updateNotificationPrefsServerFn
// ---------------------------------------------------------------------------

export const updateNotificationPrefsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateNotificationPrefsInput) => d)
  .handler(async (ctx): Promise<UpdateNotificationPrefsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    // Validate categories
    for (const p of data.preferences) {
      if (!ALL_CATEGORIES.includes(p.category)) {
        return { success: false, error: 'VALIDATION_ERROR' }
      }
    }

    const stub = getOrgStub(env, membership.orgId)
    const now = new Date().toISOString()

    const statements = data.preferences.map((p) => ({
      sql: `INSERT INTO notification_preference (id, user_id, category, email, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, category)
            DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`,
      params: [crypto.randomUUID(), membership.userId, p.category, p.email ? 1 : 0, now, now],
    }))

    await stub.executeBatch(statements)

    // Re-fetch to return updated state
    type PrefRow = { category: string; email: number }
    const rows = await stub.query<PrefRow>(
      `SELECT category, email FROM notification_preference WHERE user_id = ?`,
      membership.userId,
    )

    const prefMap = new Map(rows.map((r) => [r.category, r.email === 1]))
    const preferences: NotificationPreferenceView[] = ALL_CATEGORIES.map((cat) => ({
      category: cat,
      inApp: true,
      email: prefMap.get(cat) ?? true,
    }))

    return { success: true, preferences }
  })
