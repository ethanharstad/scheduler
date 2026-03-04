import { createFileRoute, Link, redirect, useRouteContext } from '@tanstack/react-router'
import { ArrowLeft, Clock } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import { getStaffAuditLogServerFn } from '@/server/staff'
import type { StaffAuditAction, StaffAuditEntry } from '@/lib/staff.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/staff/audit')({
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
  member_added: 'Member added',
  member_removed: 'Member removed',
  member_linked: 'Account linked',
  role_changed: 'Role changed',
  invitation_sent: 'Invitation sent',
  invitation_cancelled: 'Invitation cancelled',
  invitation_resent: 'Invitation resent',
  invitation_accepted: 'Invitation accepted',
}

const ACTION_COLORS: Record<StaffAuditAction, string> = {
  member_added: 'bg-emerald-900/40 text-emerald-400',
  member_removed: 'bg-red-900/40 text-red-400',
  member_linked: 'bg-emerald-900/40 text-emerald-400',
  role_changed: 'bg-blue-900/40 text-blue-400',
  invitation_sent: 'bg-amber-900/40 text-amber-400',
  invitation_cancelled: 'bg-slate-700 text-slate-400',
  invitation_resent: 'bg-amber-900/40 text-amber-400',
  invitation_accepted: 'bg-emerald-900/40 text-emerald-400',
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
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/orgs/$orgSlug/staff"
          params={{ orgSlug: org.slug }}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Staff
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-slate-400 mt-0.5">{total} total event{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p>No staff management events recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const detail = actionDescription(entry)
            return (
              <div
                key={entry.id}
                className="flex items-start gap-4 p-4 rounded-xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/60"
              >
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium shrink-0 ${ACTION_COLORS[entry.action]}`}
                >
                  {ACTION_LABELS[entry.action]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">
                    <span className="font-medium">
                      {entry.staffMemberName ?? 'Deleted member'}
                    </span>
                    {detail && (
                      <span className="text-slate-400 ml-1">— {detail}</span>
                    )}
                  </p>
                  {entry.performedByName && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      by {entry.performedByName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                  <Clock className="w-3 h-3" />
                  <span title={entry.createdAt}>{formatRelativeTime(entry.createdAt)}</span>
                </div>
              </div>
            )
          })}

          {total > entries.length && (
            <p className="text-center text-sm text-slate-500 pt-2">
              Showing {entries.length} of {total} events.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
