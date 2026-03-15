import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Check, Circle, AlertTriangle, Info, CheckCircle, AlertCircle } from 'lucide-react'
import {
  getUnreadCountServerFn,
  listNotificationsServerFn,
  markNotificationReadServerFn,
  markAllReadServerFn,
} from '@/server/notifications'
import type { NotificationView, NotificationType } from '@/lib/notification.types'

const POLL_INTERVAL = 60_000

const typeColors: Record<NotificationType, string> = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  success: 'text-green-500',
  action_required: 'text-red-500',
}

const typeIcons: Record<NotificationType, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  action_required: AlertCircle,
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const seconds = Math.floor((now - then) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export function NotificationBell({ orgSlug }: { orgSlug: string | null }) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationView[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Poll unread count
  const fetchCount = useCallback(async () => {
    if (!orgSlug) return
    const result = await getUnreadCountServerFn({ data: { orgSlug } })
    if (result.success) setUnreadCount(result.count)
  }, [orgSlug])

  useEffect(() => {
    void fetchCount()
    if (!orgSlug) return
    const id = setInterval(() => void fetchCount(), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [orgSlug, fetchCount])

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (!open || !orgSlug) return
    setLoading(true)
    void listNotificationsServerFn({ data: { orgSlug, limit: 20 } }).then((result) => {
      if (result.success) {
        setNotifications(result.notifications)
        setUnreadCount(result.unreadCount)
      }
      setLoading(false)
    })
  }, [open, orgSlug])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleMarkRead(notification: NotificationView) {
    if (!orgSlug) return
    if (!notification.isRead) {
      await markNotificationReadServerFn({
        data: { orgSlug, notificationId: notification.id },
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
    if (notification.link) {
      setOpen(false)
      void navigate({ to: notification.link as never })
    }
  }

  async function handleMarkAllRead() {
    if (!orgSlug) return
    await markAllReadServerFn({ data: { orgSlug } })
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  if (!orgSlug) {
    return (
      <button disabled className="relative p-2 text-gray-300 cursor-not-allowed">
        <Bell className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-gray-500 hover:text-navy-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-navy-700">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => void handleMarkAllRead()}
                className="text-xs text-gray-500 hover:text-navy-700 transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No notifications
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = typeIcons[n.type]
                return (
                  <button
                    key={n.id}
                    onClick={() => void handleMarkRead(n)}
                    className={`flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${
                      !n.isRead ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${typeColors[n.type]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-sm truncate ${
                            n.isRead ? 'text-gray-600' : 'font-medium text-navy-700'
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    {!n.isRead && (
                      <Circle className="w-2 h-2 mt-1.5 shrink-0 fill-blue-500 text-blue-500" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
