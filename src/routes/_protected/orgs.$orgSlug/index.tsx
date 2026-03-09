import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { AlertTriangle, Clock, Shield, Users } from 'lucide-react'
import { listStaffServerFn } from '@/server/staff'
import { listPlatoonsServerFn } from '@/server/platoons'
import { getTodayAssignmentsServerFn } from '@/server/schedule'
import { getExpiringCertsServerFn } from '@/server/qualifications'
import { listPendingTimeOffServerFn } from '@/server/constraints'
import { canDo } from '@/lib/rbac'
import type { TodayAssignment } from '@/server/schedule'
import type { ExpiringCertView } from '@/lib/qualifications.types'
import type { ConstraintView } from '@/lib/constraint.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/')({
  head: () => ({
    meta: [{ title: 'Dashboard | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const today = new Date().toISOString().slice(0, 10)
    const [staffResult, platoonsResult, todayResult, expiringResult, pendingTimeOffResult] = await Promise.all([
      listStaffServerFn({ data: { orgSlug: params.orgSlug } }),
      listPlatoonsServerFn({ data: { orgSlug: params.orgSlug } }),
      getTodayAssignmentsServerFn({ data: { orgSlug: params.orgSlug, date: today } }),
      getExpiringCertsServerFn({ data: { orgSlug: params.orgSlug } }),
      listPendingTimeOffServerFn({ data: { orgSlug: params.orgSlug } }).catch(() => null),
    ])
    const members = staffResult.success ? staffResult.members : []
    const platoons = platoonsResult.success ? platoonsResult.platoons : []
    const todayAssignments = todayResult.success ? todayResult.assignments : []
    const expiringCerts = expiringResult.success ? expiringResult.certs : []
    const pendingTimeOff = pendingTimeOffResult && pendingTimeOffResult.success ? pendingTimeOffResult.constraints : []
    return {
      activeCount: members.filter((m) => m.status !== 'pending').length,
      totalCount: members.length,
      platoonCount: platoons.length,
      todayAssignments,
      expiringCerts,
      pendingTimeOff,
      today,
    }
  },
  component: OrgDashboard,
})

function formatTime(datetime: string): string {
  const [, time] = datetime.split('T')
  if (!time) return datetime
  const [h, m] = time.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${m} ${ampm}`
}

function OnShiftToday({ assignments, today }: { assignments: TodayAssignment[]; today: string }) {
  const label = new Date(today + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
          On Shift Today
        </h2>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      {assignments.length === 0 ? (
        <p className="text-sm text-gray-400">No assignments scheduled for today.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {assignments.map((a, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-navy-700">{a.staffMemberName}</span>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {a.position && (
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium" style={{ fontFamily: 'var(--font-condensed)' }}>
                    {a.position}
                  </span>
                )}
                <span>{formatTime(a.startDatetime)} – {formatTime(a.endDatetime)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ExpiringCertsWidget({
  certs,
  orgSlug,
}: {
  certs: ExpiringCertView[]
  orgSlug: string
}) {
  if (certs.length === 0) return null
  return (
    <div className="rounded-lg border border-warning bg-warning-bg p-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-warning" />
        <h2 className="text-xs font-semibold text-warning uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
          Certifications Expiring Within 30 Days
        </h2>
      </div>
      <ul className="divide-y divide-warning/20">
        {certs.map((c, i) => (
          <li key={i} className="flex items-center justify-between py-2">
            <div>
              <Link
                to="/orgs/$orgSlug/staff/$staffMemberId"
                params={{ orgSlug, staffMemberId: c.staffMemberId }}
                className="text-sm font-medium text-navy-700 hover:underline"
              >
                {c.staffMemberName}
              </Link>
              <span className="text-sm text-gray-600 ml-1.5">— {c.certTypeName}</span>
            </div>
            <span className="text-xs text-warning font-semibold">
              {c.daysUntilExpiry === 0 ? 'Today' : `${c.daysUntilExpiry}d`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatDate(datetime: string): string {
  const date = new Date(datetime)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function PendingTimeOffWidget({
  requests,
  orgSlug,
}: {
  requests: ConstraintView[]
  orgSlug: string
}) {
  if (requests.length === 0) return null
  return (
    <div className="rounded-lg border border-navy-200 bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-navy-600" />
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
            Pending Time-Off Requests
          </h2>
        </div>
        <Link
          to="/orgs/$orgSlug/availability"
          params={{ orgSlug }}
          className="text-xs text-navy-600 hover:text-navy-800 font-medium"
        >
          Review all &rarr;
        </Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2">
            <div className="min-w-0">
              <span className="text-sm font-medium text-navy-700">{r.staffMemberName}</span>
              {r.reason && (
                <span className="text-sm text-gray-500 ml-1.5">— {r.reason}</span>
              )}
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap ml-3">
              {formatDate(r.startDatetime)} – {formatDate(r.endDatetime)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OrgDashboard() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { activeCount, totalCount, platoonCount, todayAssignments, expiringCerts, pendingTimeOff, today } = Route.useLoaderData()
  const canViewCerts = canDo(userRole, 'view-certifications')
  const canApproveTimeOff = canDo(userRole, 'approve-time-off')

  const createdDate = new Date(org.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy-700 mb-1">{org.name}</h1>
        <p className="text-gray-500 text-sm">Created {createdDate}</p>
      </div>

      {canViewCerts && <ExpiringCertsWidget certs={expiringCerts} orgSlug={org.slug} />}
      {canApproveTimeOff && <PendingTimeOffWidget requests={pendingTimeOff} orgSlug={org.slug} />}
      <OnShiftToday assignments={todayAssignments} today={today} />

      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/orgs/$orgSlug/staff"
          params={{ orgSlug: org.slug }}
          className="block rounded-lg border border-gray-200 bg-white p-6 hover:border-navy-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                Active Staff
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-navy-700">{activeCount}</span>
                <span className="text-sm text-gray-400">of {totalCount} total</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-navy-50 flex items-center justify-center group-hover:bg-navy-100 transition-colors">
              <Users className="w-5 h-5 text-navy-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2 group-hover:text-navy-600 transition-colors">
            View and manage staff &rarr;
          </p>
        </Link>

        <Link
          to="/orgs/$orgSlug/platoons"
          params={{ orgSlug: org.slug }}
          className="block rounded-lg border border-gray-200 bg-white p-6 hover:border-navy-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                Platoons
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-navy-700">{platoonCount}</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-navy-50 flex items-center justify-center group-hover:bg-navy-100 transition-colors">
              <Shield className="w-5 h-5 text-navy-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2 group-hover:text-navy-600 transition-colors">
            View and manage platoons &rarr;
          </p>
        </Link>
      </div>
    </div>
  )
}
