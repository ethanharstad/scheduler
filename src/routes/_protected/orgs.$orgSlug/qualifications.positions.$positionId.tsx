import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { checkPositionEligibilityServerFn } from '@/server/qualifications'
import type { EligibleStaffMember } from '@/lib/qualifications.types'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/qualifications/positions/$positionId',
)({
  head: () => ({
    meta: [{ title: 'Position Eligibility | Scene Ready' }],
  }),
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
  component: EligibilityPage,
})

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
      <div className="max-w-3xl mx-auto">
        <p className="text-gray-500">Position not found.</p>
        <Link to="/orgs/$orgSlug/qualifications" params={{ orgSlug: org.slug }} className="text-navy-700 hover:underline text-sm mt-2 inline-block">
          Back to Qualifications
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
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

      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-gray-600">As of date</label>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => void handleDateChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
        />
        {loading && <span className="text-sm text-gray-400">Loading…</span>}
      </div>

      {eligible.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No eligible staff members found for this date.</p>
          <p className="text-sm text-gray-400 mt-1">Check that staff have the required rank and certifications.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>
              {eligible.length} eligible staff member{eligible.length !== 1 ? 's' : ''}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Rank</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Certs</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((s) => (
                <tr key={s.staffMemberId} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to="/orgs/$orgSlug/staff/$staffMemberId"
                      params={{ orgSlug: org.slug, staffMemberId: s.staffMemberId }}
                      className="font-medium text-navy-700 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.rankName ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">{s.certsSummary}</span>
                      {s.hasExpiringCerts && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-bg text-warning text-xs font-semibold" style={{ fontFamily: 'var(--font-condensed)' }}>
                          <AlertTriangle className="w-3 h-3" />
                          Expiring soon
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
