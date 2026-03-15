import { useState, useEffect } from 'react'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import {
  getNotificationPrefsServerFn,
  updateNotificationPrefsServerFn,
} from '@/server/notifications'
import type { NotificationPreferenceView, NotificationCategory } from '@/lib/notification.types'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/settings/notifications',
)({
  head: () => ({
    meta: [{ title: 'Notification Settings | Scene Ready' }],
  }),
  component: NotificationSettingsPage,
})

const categoryLabels: Record<NotificationCategory, { label: string; description: string }> = {
  schedule_change: {
    label: 'Schedule Changes',
    description: 'Shift assignments, schedule publication, and modifications',
  },
  shift_trade: {
    label: 'Shift Trades',
    description: 'Trade proposals, acceptances, approvals, and coverage requests',
  },
  time_off: {
    label: 'Time Off',
    description: 'Time-off request submissions, approvals, and denials',
  },
  cert_expiration: {
    label: 'Cert Expirations',
    description: 'Upcoming certification and qualification expirations',
  },
  general: {
    label: 'General',
    description: 'General announcements and other notifications',
  },
}

function NotificationSettingsPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const [prefs, setPrefs] = useState<NotificationPreferenceView[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<NotificationCategory | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  useEffect(() => {
    void getNotificationPrefsServerFn({ data: { orgSlug: org.slug } }).then((result) => {
      if (result.success) setPrefs(result.preferences)
      setLoading(false)
    })
  }, [org.slug])

  async function handleToggleEmail(category: NotificationCategory, currentValue: boolean) {
    setSaving(category)
    setFeedback(null)
    const result = await updateNotificationPrefsServerFn({
      data: {
        orgSlug: org.slug,
        preferences: [{ category, email: !currentValue }],
      },
    })
    if (result.success) {
      setPrefs(result.preferences)
      setFeedback({ type: 'success', message: 'Preference updated.' })
    } else {
      setFeedback({ type: 'error', message: 'Failed to update preference.' })
    }
    setSaving(null)
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold text-navy-700 mb-1">Notifications</h1>
        <p className="text-sm text-gray-500 mb-6">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-navy-700 mb-1">Notifications</h1>
      <p className="text-sm text-gray-500 mb-6">
        Choose how you receive notifications for this organization.
      </p>

      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden max-w-xl">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                Category
              </th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 w-20">
                In-App
              </th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 w-20">
                Email
              </th>
            </tr>
          </thead>
          <tbody>
            {prefs.map((pref) => {
              const info = categoryLabels[pref.category]
              return (
                <tr key={pref.category} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-navy-700">{info.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{info.description}</div>
                  </td>
                  <td className="text-center px-4 py-3">
                    <input
                      type="checkbox"
                      checked
                      disabled
                      className="w-4 h-4 rounded border-gray-300 text-navy-700 cursor-not-allowed"
                    />
                  </td>
                  <td className="text-center px-4 py-3">
                    <button
                      onClick={() => void handleToggleEmail(pref.category, pref.email)}
                      disabled={saving === pref.category}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        pref.email ? 'bg-navy-700' : 'bg-gray-300'
                      } ${saving === pref.category ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          pref.email ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {feedback && (
        <p
          className={`text-sm mt-3 ${feedback.type === 'success' ? 'text-green-700' : 'text-red-700'}`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  )
}
