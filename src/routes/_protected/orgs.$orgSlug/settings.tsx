import { useState } from 'react'
import { createFileRoute, redirect, useRouteContext } from '@tanstack/react-router'
import { canDo } from '@/lib/rbac'
import { updateOrgSettingsServerFn } from '@/server/org'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/settings')({
  head: () => ({
    meta: [{ title: 'Settings | Scene Ready' }],
  }),
  beforeLoad: async ({ context }) => {
    if (!canDo(context.userRole, 'edit-org-settings')) {
      throw redirect({ to: '/orgs/$orgSlug', params: { orgSlug: context.org.slug } })
    }
  },
  component: OrgSettingsPage,
})

function OrgSettingsPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const [scheduleDayStart, setScheduleDayStart] = useState(org.scheduleDayStart)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateOrgSettingsServerFn({ data: { orgSlug: org.slug, scheduleDayStart } })
      if (result.success) {
        setFeedback({ type: 'success', message: 'Settings saved.' })
      } else {
        setFeedback({ type: 'error', message: result.error === 'FORBIDDEN' ? 'You do not have permission to edit settings.' : 'Failed to save settings.' })
      }
    } catch {
      setFeedback({ type: 'error', message: 'An unexpected error occurred.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="border border-gray-200 rounded-lg bg-white p-6">
        <h1 className="text-xl font-bold text-navy-700 mb-6">Organization Settings</h1>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label htmlFor="scheduleDayStart" className="block text-sm font-medium text-gray-700 mb-1">
              Schedule Day Start
            </label>
            <p className="text-xs text-gray-500 mb-2">
              The time that marks the start of a scheduling day. Use 07:00 for departments running 24-hour shifts from 0700 to 0700.
            </p>
            <input
              id="scheduleDayStart"
              type="time"
              value={scheduleDayStart}
              onChange={(e) => setScheduleDayStart(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-navy-700"
            />
          </div>

          {feedback && (
            <p className={`text-sm ${feedback.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {feedback.message}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={saving}
              className="bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
