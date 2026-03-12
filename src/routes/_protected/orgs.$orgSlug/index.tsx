import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { AlertTriangle, Calendar, Clock, Shield, Users, Wrench } from 'lucide-react'
import { listStaffServerFn } from '@/server/staff'
import { listPlatoonsServerFn } from '@/server/platoons'
import { getTodayAssignmentsServerFn, getMyUpcomingShiftsServerFn, listSchedulesServerFn } from '@/server/schedule'
import { getExpiringCertsServerFn } from '@/server/qualifications'
import { listPendingTimeOffServerFn } from '@/server/constraints'
import { getExpiringAssetsServerFn, getOverdueInspectionsServerFn } from '@/server/assets'
import { canDo } from '@/lib/rbac'
import type { TodayAssignment, UpcomingShift } from '@/server/schedule'
import type { ExpiringCertView } from '@/lib/qualifications.types'
import type { ConstraintView } from '@/lib/constraint.types'
import type { AssetView, OverdueInspectionView } from '@/lib/asset.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/')({
  head: () => ({
    meta: [{ title: 'Dashboard | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const today = new Date().toISOString().slice(0, 10)
    const [staffResult, platoonsResult, todayResult, expiringResult, pendingTimeOffResult, expiringAssetsResult, overdueInspectionsResult, myShiftsResult, schedulesResult] = await Promise.all([
      listStaffServerFn({ data: { orgSlug: params.orgSlug } }),
      listPlatoonsServerFn({ data: { orgSlug: params.orgSlug } }),
      getTodayAssignmentsServerFn({ data: { orgSlug: params.orgSlug, date: today } }),
      getExpiringCertsServerFn({ data: { orgSlug: params.orgSlug } }),
      listPendingTimeOffServerFn({ data: { orgSlug: params.orgSlug } }).catch(() => null),
      getExpiringAssetsServerFn({ data: { orgSlug: params.orgSlug, lookaheadDays: 30 } }).catch(() => null),
      getOverdueInspectionsServerFn({ data: { orgSlug: params.orgSlug } }).catch(() => null),
      getMyUpcomingShiftsServerFn({ data: { orgSlug: params.orgSlug } }).catch(() => null),
      listSchedulesServerFn({ data: { orgSlug: params.orgSlug } }).catch(() => null),
    ])
    const members = staffResult.success ? staffResult.members : []
    const platoons = platoonsResult.success ? platoonsResult.platoons : []
    const todayAssignments = todayResult.success ? todayResult.assignments : []
    const expiringCerts = expiringResult.success ? expiringResult.certs : []
    const pendingTimeOff = pendingTimeOffResult && pendingTimeOffResult.success ? pendingTimeOffResult.constraints : []
    const expiringAssets = expiringAssetsResult?.success ? expiringAssetsResult.assets : []
    const overdueInspections = overdueInspectionsResult?.success ? overdueInspectionsResult.overdueInspections : []
    const myUpcomingShifts = myShiftsResult && myShiftsResult.success ? myShiftsResult.shifts : []
    const schedules = schedulesResult?.success ? schedulesResult.schedules : []
    const currentSchedule = schedules.find(
      (s) => s.status === 'published' && s.startDate <= today && s.endDate >= today
    ) ?? null
    return {
      activeCount: members.filter((m) => m.status !== 'pending').length,
      totalCount: members.length,
      platoonCount: platoons.length,
      todayAssignments,
      expiringCerts,
      pendingTimeOff,
      expiringAssets,
      overdueInspections,
      myUpcomingShifts,
      currentScheduleId: currentSchedule?.id ?? null,
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

function ScheduleWidget({
  assignments,
  shifts,
  orgSlug,
  today,
  currentScheduleId,
}: {
  assignments: TodayAssignment[]
  shifts: UpcomingShift[]
  orgSlug: string
  today: string
  currentScheduleId: string | null
}) {
  const todayLabel = new Date(today + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-navy-600" />
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
            Schedule
          </h2>
        </div>
        {currentScheduleId ? (
          <Link
            to="/orgs/$orgSlug/schedules/$scheduleId"
            params={{ orgSlug, scheduleId: currentScheduleId }}
            className="text-xs text-navy-600 hover:text-navy-800 font-medium"
          >
            View schedule &rarr;
          </Link>
        ) : (
          <Link
            to="/orgs/$orgSlug/schedules"
            params={{ orgSlug }}
            className="text-xs text-navy-600 hover:text-navy-800 font-medium"
          >
            View schedule &rarr;
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        {/* On Shift Today */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
              On Shift Today
            </span>
            <span className="text-xs text-gray-400">{todayLabel}</span>
          </div>
          {assignments.length === 0 ? (
            <p className="text-sm text-gray-400">No assignments today.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {assignments.map((a, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-navy-700">{a.staffMemberName}</span>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {a.position && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium" style={{ fontFamily: 'var(--font-condensed)' }}>
                        {a.position}
                      </span>
                    )}
                    <span className="whitespace-nowrap">{formatTime(a.startDatetime)} – {formatTime(a.endDatetime)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* My Upcoming Shifts */}
        <div className="p-5">
          <div className="mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
              My Upcoming Shifts
            </span>
          </div>
          {shifts.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming shifts scheduled.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shifts.map((s, i) => {
                const dateLabel = new Date(s.startDatetime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                return (
                  <li key={i} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-navy-700 whitespace-nowrap">{dateLabel}</span>
                      {s.position && (
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium" style={{ fontFamily: 'var(--font-condensed)' }}>
                          {s.position}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-3">
                      {formatTime(s.startDatetime)} – {formatTime(s.endDatetime)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
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

function daysUntil(dateStr: string, today: string): number {
  return Math.ceil(
    (new Date(dateStr + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000
  )
}

function AssetComplianceWidget({
  expiringAssets,
  overdueInspections,
  orgSlug,
  today,
}: {
  expiringAssets: AssetView[]
  overdueInspections: OverdueInspectionView[]
  orgSlug: string
  today: string
}) {
  const actuallyOverdue = overdueInspections.filter(
    (item) => item.schedule.nextInspectionDue && daysUntil(item.schedule.nextInspectionDue, today) < 0
  )
  const dueSoon = overdueInspections.filter(
    (item) => !item.schedule.nextInspectionDue || daysUntil(item.schedule.nextInspectionDue, today) >= 0
  )

  const totalAlerts = actuallyOverdue.length + dueSoon.length + expiringAssets.length
  const hasOverdue = actuallyOverdue.length > 0

  const allClear = totalAlerts === 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-navy-600" />
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
            Asset Compliance Alerts
          </h2>
          {!allClear && (
            <span
              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold ${hasOverdue ? 'bg-danger text-white' : 'bg-warning text-white'}`}
              style={{ fontFamily: 'var(--font-condensed)', minWidth: '1.5rem' }}
            >
              {totalAlerts}
            </span>
          )}
        </div>
        <Link
          to="/orgs/$orgSlug/assets"
          params={{ orgSlug }}
          className="text-xs text-navy-600 hover:text-navy-800 font-medium"
        >
          View assets &rarr;
        </Link>
      </div>
      {allClear ? (
        <div className="px-6 py-5 flex items-center gap-3 bg-success-bg">
          <Shield className="w-4 h-4 text-success flex-shrink-0" />
          <span className="text-sm text-success font-medium">All assets are compliant</span>
        </div>
      ) : (
        <>
          {actuallyOverdue.length > 0 && (
            <div className={`px-6 py-4 bg-danger-bg border-b border-danger/20 ${(dueSoon.length > 0 || expiringAssets.length > 0) ? '' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-danger" />
                <span className="text-xs font-semibold text-danger uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Overdue Inspections
                </span>
              </div>
              <ul className="divide-y divide-danger/10">
                {actuallyOverdue.map((item) => {
                  const days = item.schedule.nextInspectionDue ? daysUntil(item.schedule.nextInspectionDue, today) : null
                  return (
                    <li key={item.schedule.id} className="flex items-center justify-between py-2">
                      <Link
                        to="/orgs/$orgSlug/assets/$assetId"
                        params={{ orgSlug, assetId: item.assetId }}
                        className="text-sm font-medium text-navy-700 hover:underline"
                      >
                        {item.assetName} — {item.schedule.label}
                      </Link>
                      <span className="text-xs text-danger font-semibold">
                        {days === null ? 'Overdue' : `${Math.abs(days)}d overdue`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {dueSoon.length > 0 && (
            <div className={`px-6 py-4 bg-warning-bg border-b border-warning/20`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-warning" />
                <span className="text-xs font-semibold text-warning uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Inspections Due Soon
                </span>
              </div>
              <ul className="divide-y divide-warning/10">
                {dueSoon.map((item) => {
                  const days = item.schedule.nextInspectionDue ? daysUntil(item.schedule.nextInspectionDue, today) : null
                  return (
                    <li key={item.schedule.id} className="flex items-center justify-between py-2">
                      <Link
                        to="/orgs/$orgSlug/assets/$assetId"
                        params={{ orgSlug, assetId: item.assetId }}
                        className="text-sm font-medium text-navy-700 hover:underline"
                      >
                        {item.assetName} — {item.schedule.label}
                      </Link>
                      <span className="text-xs text-warning font-semibold">
                        {days === null ? 'Due soon' : days === 0 ? 'Due today' : `Due in ${days}d`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {expiringAssets.length > 0 && (
            <div className="px-6 py-4 bg-warning-bg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                <span className="text-xs font-semibold text-warning uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Expiring Within 30 Days
                </span>
              </div>
              <ul className="divide-y divide-warning/10">
                {expiringAssets.map((a) => {
                  const days = a.expirationDate ? daysUntil(a.expirationDate, today) : null
                  const absDate = a.expirationDate
                    ? new Date(a.expirationDate + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : null
                  return (
                    <li key={a.id} className="flex items-center justify-between py-2">
                      <Link
                        to="/orgs/$orgSlug/assets"
                        params={{ orgSlug }}
                        className="text-sm font-medium text-navy-700 hover:underline"
                      >
                        {a.name}
                      </Link>
                      <span className="text-xs text-warning font-semibold">
                        {days === null
                          ? 'Expiring'
                          : days === 0
                          ? 'Today'
                          : days <= 14 && absDate
                          ? `${absDate} (${days}d)`
                          : `${days}d`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}


function OrgDashboard() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { activeCount, totalCount, platoonCount, todayAssignments, expiringCerts, pendingTimeOff, expiringAssets, overdueInspections, myUpcomingShifts, currentScheduleId, today } = Route.useLoaderData()
  const canViewCerts = canDo(userRole, 'view-certifications')
  const canApproveTimeOff = canDo(userRole, 'approve-time-off')
  const canManageAssets = canDo(userRole, 'manage-assets')

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
      {canManageAssets && (
        <AssetComplianceWidget
          expiringAssets={expiringAssets}
          overdueInspections={overdueInspections}
          orgSlug={org.slug}
          today={today}
        />
      )}
      <ScheduleWidget assignments={todayAssignments} shifts={myUpcomingShifts} orgSlug={org.slug} today={today} currentScheduleId={currentScheduleId} />

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
          to="/orgs/$orgSlug/schedules/platoons"
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
