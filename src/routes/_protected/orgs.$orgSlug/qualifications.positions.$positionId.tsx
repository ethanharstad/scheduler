import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { ArrowLeft, AlertTriangle, Calendar, UserCheck } from 'lucide-react'
import { checkPositionEligibilityServerFn } from '@/server/qualifications'
import type { EligibleStaffMember } from '@/lib/qualifications.types'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/qualifications/positions/$positionId',
)({
  loader: async ({ params }) => {
    const today = new Date().toISOString().slice(0, 10)
    const result = await checkPositionEligibilityServerFn({
      data: { orgSlug: params.orgSlug, positionId: params.positionId, asOfDate: today },
    })
    return {
      eligible: result.success ? result.eligible : [],
      positionName: result.success ? result.positionName : 'Position',
      today,
      error: result.success ? null : result.error,
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.positionName ?? 'Position Eligibility'} | Scene Ready` }],
  }),
  component: EligibilityPage,
})

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function RankChip({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full bg-navy-700 text-white text-xs font-semibold"
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {name}
    </span>
  )
}

function CertChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 text-xs font-semibold border border-navy-100"
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function EligibilityPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { eligible: initialEligible, positionName, today, error } = Route.useLoaderData()
  const params = Route.useParams()

  const [asOfDate, setAsOfDate] = useState(today)
  const [eligible, setEligible] = useState<EligibleStaffMember[]>(initialEligible)
  const [loading, setLoading] = useState(false)

  async function handleDateChange(newDate: string) {
    setAsOfDate(newDate)
    setLoading(true)
    try {
      const result = await checkPositionEligibilityServerFn({
        data: { orgSlug: org.slug, positionId: params.positionId, asOfDate: newDate },
      })
      if (result.success) setEligible(result.eligible)
    } finally {
      setLoading(false)
    }
  }

  if (error === 'NOT_FOUND') {
    return (
      <div>
        <p className="text-gray-500">Position not found.</p>
        <Link to="/orgs/$orgSlug/qualifications" params={{ orgSlug: org.slug }} className="text-navy-700 hover:underline text-sm mt-2 inline-block">
          Back to Qualifications
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link
        to="/orgs/$orgSlug/qualifications"
        params={{ orgSlug: org.slug }}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Qualifications
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-700 mb-1">{positionName}</h1>
        <p className="text-sm text-gray-500">Eligible staff members who meet all rank and cert requirements.</p>
      </div>

      <div className="mb-6 inline-flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white">
        <Calendar className="w-4 h-4 text-navy-500 shrink-0" />
        <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Check eligibility as of</span>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => void handleDateChange(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-gray-50"
        />
        {loading && <span className="text-sm text-gray-400 ml-1">Loading…</span>}
      </div>

      {eligible.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 mb-4">
            <UserCheck className="w-7 h-7 text-gray-400" />
          </div>
          <p className="font-semibold text-gray-600">No eligible staff members</p>
          <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
            No one meets all requirements as of this date. Try a different date or review position requirements.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>
              {eligible.length} eligible staff member{eligible.length !== 1 ? 's' : ''}
            </span>
          </div>
          {eligible.map((s) => (
            <div key={s.staffMemberId} className="flex items-start gap-4 px-4 py-3 hover:bg-gray-50">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-navy-50 text-navy-700 text-sm font-bold shrink-0 mt-0.5">
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to="/orgs/$orgSlug/staff/$staffMemberId"
                  params={{ orgSlug: org.slug, staffMemberId: s.staffMemberId }}
                  className="font-semibold text-navy-700 hover:underline text-sm"
                >
                  {s.name}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {s.rankName && <RankChip name={s.rankName} />}
                  {s.certsSummary && s.certsSummary.split(', ').map((cert, i) => (
                    <CertChip key={i} label={cert} />
                  ))}
                  {s.hasExpiringCerts && (
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-bg text-warning text-xs font-semibold"
                      style={{ fontFamily: 'var(--font-condensed)' }}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      Expiring soon
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
