// ---------------------------------------------------------------------------
// Notification system types
// ---------------------------------------------------------------------------

export type NotificationType = 'info' | 'warning' | 'success' | 'action_required'

export type NotificationChannel = 'in_app' | 'email'

export type NotificationCategory =
  | 'schedule_change'
  | 'shift_trade'
  | 'time_off'
  | 'cert_expiration'
  | 'general'

// --- Domain views ---

export interface NotificationView {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: string
}

export interface NotificationPreferenceView {
  category: NotificationCategory
  inApp: boolean
  email: boolean
}

// --- Internal creation params (used by server modules) ---

export interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string
  channels?: NotificationChannel[]
}

// --- Server function I/O ---

export interface ListNotificationsInput {
  orgSlug: string
  limit?: number
  offset?: number
}

export type ListNotificationsOutput =
  | { success: true; notifications: NotificationView[]; unreadCount: number }
  | { success: false; error: 'UNAUTHORIZED' }

export interface GetUnreadCountInput {
  orgSlug: string
}

export type GetUnreadCountOutput =
  | { success: true; count: number }
  | { success: false; error: 'UNAUTHORIZED' }

export interface MarkNotificationReadInput {
  orgSlug: string
  notificationId: string
}

export type MarkNotificationReadOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export interface MarkAllReadInput {
  orgSlug: string
}

export type MarkAllReadOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' }

export interface GetNotificationPrefsInput {
  orgSlug: string
}

export type GetNotificationPrefsOutput =
  | { success: true; preferences: NotificationPreferenceView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export interface UpdateNotificationPrefsInput {
  orgSlug: string
  preferences: Array<{ category: NotificationCategory; email: boolean }>
}

export type UpdateNotificationPrefsOutput =
  | { success: true; preferences: NotificationPreferenceView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'VALIDATION_ERROR' }
