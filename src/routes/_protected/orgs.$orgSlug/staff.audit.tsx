import { createFileRoute, Link, redirect, useRouteContext } from '@tanstack/react-router'
import { ArrowLeft, Clock } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import { getStaffAuditLogServerFn } from '@/server/staff'
import type { StaffAuditAction, StaffAuditEntry } from '@/lib/staff.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/staff/audit')({
  head: () => ({
    meta: [{ title: 'Audit Log | Scene Ready' }],
  }),
  beforeLoad: ({ context }) => {
    const { userRole } = context as { userRole: string }
    if (!canDo(userRole as Parameters<typeof canDo>[0], 'assign-roles')) {
      throw redirect({ to: '/orgs/$orgSlug/staff', params: { orgSlug: (context as { org: { slug: string } }).org.slug } })
    }
  },
  loader: async ({ params }): Promise<{ entries: StaffAuditEntry[]; total: number }> => {
    const result = await getStaffAuditLogServerFn({ data: { orgSlug: params.orgSlug } })
    if (!result.success) return { entries: [], total: 0 }
    return { entries: result.entries, total: result.total }
  },
  component: StaffAuditPage,
})

const ACTION_LABELS: Record<StaffAuditAction, string> = {
  member_added: 'Member Added',
  member_removed: 'Member Removed',
  member_linked: 'Account Linked',
  role_changed: 'Role Changed',
  invitation_sent: 'Invitation Sent',
  invitation_cancelled: 'Invitation Cancelled',
  invitation_resent: 'Invitation Resent',
  invitation_accepted: 'Invitation Accepted',
}

const ACTION_BADGE_COLORS: Record<StaffAuditAction, string> = {
  member_added: 'bg-success-bg text-success',
  member_removed: 'bg-danger-bg text-danger',
  member_linked: 'bg-success-bg text-success',
  role_changed: 'bg-info-bg text-info',
  invitation_sent: 'bg-warning-bg text-warning',
  invitation_cancelled: 'bg-gray-100 text-gray-500',
  invitation_resent: 'bg-warning-bg text-warning',
  invitation_accepted: 'bg-success-bg text-success',
}

function formatRelativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(isoString).toLocaleDateString()
}

function actionDescription(entry: StaffAuditEntry): string {
  const m = entry.metadata
  if (entry.action === 'role_changed' && m?.from && m?.to) {
    return `${m.from} → ${m.to}`
  }
  if (entry.action === 'member_added' && m?.email) {
    return m.email
  }
  if ((entry.action === 'invitation_sent' || entry.action === 'invitation_resent' || entry.action === 'invitation_cancelled') && m?.email) {
    return m.email
  }
  return ''
}

function StaffAuditPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { entries, total } = Route.useLoaderData()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/orgs/$orgSlug/staff"
          params={{ orgSlug: org.slug }}
          className="flex items-center gap-1.5 text-gray-500 hover:text-navy-700 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Staff
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total event{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No staff management events recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const detail = actionDescription(entry)
            return (
              <div
                key={entry.id}
                className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
              >
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide shrink-0 ${ACTION_BADGE_COLORS[entry.action]}`}
                  style={{ fontFamily: 'var(--font-condensed)' }}
                >
                  {ACTION_LABELS[entry.action]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">
                      {entry.staffMemberName ?? 'Deleted member'}
                    </span>
                    {detail && (
                      <span className="text-gray-500 ml-1">— {detail}</span>
                    )}
                  </p>
                  {entry.performedByName && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      by {entry.performedByName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                  <Clock className="w-3 h-3" />
                  <span title={entry.createdAt}>{formatRelativeTime(entry.createdAt)}</span>
                </div>
              </div>
            )
          })}

          {total > entries.length && (
            <p className="text-center text-sm text-gray-400 pt-2">
              Showing {entries.length} of {total} events.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
