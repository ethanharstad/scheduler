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

function formatDate(datetime: string): string {
  const date = new Date(datetime)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function daysUntil(dateStr: string, today: string): number {
  return Math.ceil(
    (new Date(dateStr + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function positionBadgeClass(position: string): string {
  const p = position.toLowerCase()
  if (p.includes('officer') || p.includes('captain') || p.includes('chief') || p.includes('lieutenant') || p.startsWith('lt ') || p.includes(' lt ')) {
    return 'bg-red-100 text-red-700'
  }
  if (p.includes('senior') || p.startsWith('sr ') || p.includes(' sr ') || p.includes('sr.')) {
    return 'bg-navy-100 text-navy-700'
  }
  if (p.includes('backup')) {
    return 'bg-warning-bg text-warning'
  }
  return 'bg-gray-100 text-gray-600'
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
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
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

      {/* On Shift Today */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
            On Shift Today
          </span>
          <span className="px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
            {todayLabel}
          </span>
        </div>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-400">No assignments today.</p>
        ) : (
          <ul className="space-y-1">
            {assignments.map((a, i) => (
              <li key={i} className="flex items-center justify-between py-1.5 pl-3 border-l-[3px] border-navy-700">
                <span className="text-sm font-medium text-navy-700">{a.staffMemberName}</span>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {a.position && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${positionBadgeClass(a.position)}`} style={{ fontFamily: 'var(--font-condensed)' }}>
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
      <div className="px-5 py-4">
        <div className="mb-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
            My Upcoming Shifts
          </span>
        </div>
        {shifts.length === 0 ? (
          <p className="text-sm text-gray-400">No upcoming shifts scheduled.</p>
        ) : (
          <ul className="space-y-1">
            {shifts.map((s, i) => {
              const dateLabel = new Date(s.startDatetime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
              return (
                <li key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 text-xs font-semibold whitespace-nowrap" style={{ fontFamily: 'var(--font-condensed)' }}>
                      {dateLabel}
                    </span>
                    {s.position && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${positionBadgeClass(s.position)}`} style={{ fontFamily: 'var(--font-condensed)' }}>
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
    <div className="rounded-lg border border-warning bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-warning/30 bg-warning-bg">
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
        <h2 className="text-xs font-semibold text-warning uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
          Certifications Expiring Within 30 Days
        </h2>
        <span className="ml-auto inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-warning text-white text-xs font-bold" style={{ fontFamily: 'var(--font-condensed)', minWidth: '1.5rem' }}>
          {certs.length}
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {certs.map((c, i) => (
          <li key={i} className="flex items-center justify-between px-5 py-2.5">
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
            <span className="text-xs text-warning font-semibold whitespace-nowrap ml-3">
              {c.daysUntilExpiry === 0 ? 'Today' : `${c.daysUntilExpiry}d`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
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
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-navy-600" />
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
            Pending Time-Off Requests
          </h2>
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-navy-100 text-navy-700 text-xs font-bold" style={{ fontFamily: 'var(--font-condensed)', minWidth: '1.5rem' }}>
            {requests.length}
          </span>
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
        {requests.map((r) => {
          const initials = getInitials(r.staffMemberName)
          return (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="w-8 h-8 rounded-full bg-navy-100 text-navy-700 flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ fontFamily: 'var(--font-condensed)' }}>
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-navy-700">{r.staffMemberName}</span>
                {r.reason && (
                  <span className="text-sm text-gray-500 ml-1.5">— {r.reason}</span>
                )}
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {formatDate(r.startDatetime)} – {formatDate(r.endDatetime)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
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
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-navy-600" />
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
            Asset Compliance
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
        <div className="px-5 py-4 flex items-center gap-3 bg-success-bg">
          <Shield className="w-4 h-4 text-success flex-shrink-0" />
          <span className="text-sm text-success font-medium">All assets are compliant</span>
        </div>
      ) : (
        <>
          {actuallyOverdue.length > 0 && (
            <div className="px-5 py-4 bg-danger-bg border-b border-danger/20">
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
                      <span className="text-xs text-danger font-semibold whitespace-nowrap ml-3">
                        {days === null ? 'Overdue' : `${Math.abs(days)}d overdue`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {dueSoon.length > 0 && (
            <div className="px-5 py-4 bg-warning-bg border-b border-warning/20">
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
                      <span className="text-xs text-warning font-semibold whitespace-nowrap ml-3">
                        {days === null ? 'Due soon' : days === 0 ? 'Due today' : `Due in ${days}d`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {expiringAssets.length > 0 && (
            <div className="px-5 py-4 bg-warning-bg">
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
                      <span className="text-xs text-warning font-semibold whitespace-nowrap ml-3">
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

  const todayFormatted = new Date(today + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const overdueCount = overdueInspections.filter(
    (item) => item.schedule.nextInspectionDue && daysUntil(item.schedule.nextInspectionDue, today) < 0
  ).length
  const assetAlertCount = overdueInspections.length + expiringAssets.length

  const alertCount =
    (canViewCerts ? expiringCerts.length : 0) +
    (canApproveTimeOff ? pendingTimeOff.length : 0) +
    (canManageAssets ? assetAlertCount : 0)

  const hasAlerts = alertCount > 0
  const hasOverdueAssets = canManageAssets && overdueCount > 0

  const hasAlertWidgets =
    (canViewCerts && expiringCerts.length > 0) ||
    (canApproveTimeOff && pendingTimeOff.length > 0) ||
    canManageAssets

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-4 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
          Dashboard
        </p>
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-bold text-navy-700">{todayFormatted}</p>
          <p className="text-sm text-gray-500 font-medium">{org.name}</p>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <Link
          to="/orgs/$orgSlug/staff"
          params={{ orgSlug: org.slug }}
          className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-navy-300 hover:shadow-sm transition-all group"
          style={{ borderTopWidth: '3px', borderTopColor: 'var(--color-navy-500)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                Active Staff
              </p>
              <p className="text-3xl font-bold text-navy-700 leading-none">{activeCount}</p>
              <p className="text-xs text-gray-400 mt-1">of {totalCount} total</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-navy-50 flex items-center justify-center group-hover:bg-navy-100 transition-colors flex-shrink-0">
              <Users className="w-4 h-4 text-navy-600" />
            </div>
          </div>
        </Link>

        <Link
          to="/orgs/$orgSlug/schedules/platoons"
          params={{ orgSlug: org.slug }}
          className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-navy-300 hover:shadow-sm transition-all group"
          style={{ borderTopWidth: '3px', borderTopColor: 'var(--color-navy-300)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                Platoons
              </p>
              <p className="text-3xl font-bold text-navy-700 leading-none">{platoonCount}</p>
              <p className="text-xs text-gray-400 mt-1">configured</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-navy-50 flex items-center justify-center group-hover:bg-navy-100 transition-colors flex-shrink-0">
              <Shield className="w-4 h-4 text-navy-600" />
            </div>
          </div>
        </Link>

        <Link
          to={currentScheduleId ? '/orgs/$orgSlug/schedules/$scheduleId' : '/orgs/$orgSlug/schedules'}
          params={currentScheduleId ? { orgSlug: org.slug, scheduleId: currentScheduleId } : { orgSlug: org.slug }}
          className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-navy-300 hover:shadow-sm transition-all group"
          style={{ borderTopWidth: '3px', borderTopColor: todayAssignments.length > 0 ? 'var(--color-success)' : 'var(--color-navy-300)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                On Shift Today
              </p>
              <p className="text-3xl font-bold text-navy-700 leading-none">{todayAssignments.length}</p>
              <p className="text-xs text-gray-400 mt-1">assigned</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-navy-50 flex items-center justify-center group-hover:bg-navy-100 transition-colors flex-shrink-0">
              <Calendar className="w-4 h-4 text-navy-600" />
            </div>
          </div>
        </Link>

        <Link
          to="/orgs/$orgSlug/assets"
          params={{ orgSlug: org.slug }}
          className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-navy-300 hover:shadow-sm transition-all group"
          style={{ borderTopWidth: '3px', borderTopColor: hasOverdueAssets ? 'var(--color-danger)' : hasAlerts ? 'var(--color-warning)' : 'var(--color-success)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>
                Open Alerts
              </p>
              <p className={`text-3xl font-bold leading-none ${hasAlerts ? (hasOverdueAssets ? 'text-danger' : 'text-warning') : 'text-success'}`}>
                {alertCount}
              </p>
              <p className="text-xs text-gray-400 mt-1">{hasAlerts ? 'need attention' : 'all clear'}</p>
            </div>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center group-hover:opacity-80 transition-opacity flex-shrink-0 ${hasAlerts ? (hasOverdueAssets ? 'bg-danger-bg' : 'bg-warning-bg') : 'bg-success-bg'}`}>
              <AlertTriangle className={`w-4 h-4 ${hasAlerts ? (hasOverdueAssets ? 'text-danger' : 'text-warning') : 'text-success'}`} />
            </div>
          </div>
        </Link>
      </div>

      {/* Main Content: Two-column */}
      <div className="flex gap-5 items-start">
        {/* Alerts Column */}
        {hasAlertWidgets && (
          <div className="flex-[3] space-y-4">
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
          </div>
        )}

        {/* Schedule Column */}
        <div className={hasAlertWidgets ? 'flex-[2]' : 'flex-1'}>
          <ScheduleWidget
            assignments={todayAssignments}
            shifts={myUpcomingShifts}
            orgSlug={org.slug}
            today={today}
            currentScheduleId={currentScheduleId}
          />
        </div>
      </div>
    </div>
  )
}
