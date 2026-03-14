import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { ArrowRightLeft, Gift, ArrowLeft, Check, X, AlertTriangle, Clock } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { ShiftTradeView, TradeStatus } from '@/lib/trade.types'
import type { EligibilityWarning } from '@/lib/qualifications.types'
import {
  getTradeServerFn,
  acceptTradeServerFn,
  withdrawTradeServerFn,
  reviewTradeServerFn,
} from '@/server/trades'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/trades/$tradeId')({
  head: () => ({
    meta: [{ title: 'Trade Detail | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const result = await getTradeServerFn({
      data: { orgSlug: params.orgSlug, tradeId: params.tradeId },
    })
    if (!result.success) return { trade: null, warnings: [], error: result.error }
    return { trade: result.trade, warnings: result.eligibilityWarnings, error: null }
  },
  component: TradeDetailPage,
})

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const STATUS_CONFIG: Record<TradeStatus, { label: string; cls: string }> = {
  pending_acceptance: { label: 'Pending Acceptance', cls: 'bg-warning-bg text-warning' },
  pending_approval: { label: 'Pending Approval', cls: 'bg-blue-50 text-blue-700' },
  approved: { label: 'Approved', cls: 'bg-success-bg text-success' },
  denied: { label: 'Denied', cls: 'bg-danger-bg text-danger' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-gray-100 text-gray-600' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-500' },
  cancelled_system: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
}

function TradeDetailPage() {
  const { userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { orgSlug, tradeId } = Route.useParams()
  const loaderData = Route.useLoaderData()

  const [trade, setTrade] = useState<ShiftTradeView | null>(loaderData.trade)
  const [warnings] = useState<EligibilityWarning[]>(loaderData.warnings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(loaderData.error)
  const [denyReason, setDenyReason] = useState('')
  const [showDenyForm, setShowDenyForm] = useState(false)

  if (!trade) {
    return (
      <div className="space-y-4">
        <Link
          to="/orgs/$orgSlug/trades"
          params={{ orgSlug }}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Trades
        </Link>
        <div className="bg-danger-bg border border-red-200 rounded-lg px-6 py-4 text-sm text-danger">
          Trade not found{error ? `: ${error}` : ''}.
        </div>
      </div>
    )
  }

  const t = trade
  const statusConfig = STATUS_CONFIG[t.status]
  const canApprove = canDo(userRole, 'approve-trade')
  const isActive = t.status === 'pending_acceptance' || t.status === 'pending_approval'

  async function handleWithdraw() {
    setBusy(true)
    setError(null)
    try {
      const result = await withdrawTradeServerFn({ data: { orgSlug, tradeId } })
      if (result.success) {
        setTrade((prev) => prev ? { ...prev, status: 'withdrawn' } : prev)
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleAcceptGiveaway() {
    setBusy(true)
    setError(null)
    try {
      const result = await acceptTradeServerFn({ data: { orgSlug, tradeId } })
      if (result.success) {
        setTrade(result.trade)
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleReview(decision: 'approved' | 'denied') {
    setBusy(true)
    setError(null)
    try {
      const result = await reviewTradeServerFn({
        data: { orgSlug, tradeId, decision, reason: decision === 'denied' ? denyReason : undefined },
      })
      if (result.success) {
        setTrade(result.trade)
        setShowDenyForm(false)
      } else {
        setError(
          result.error === 'SELF_REVIEW'
            ? 'You cannot approve your own trade.'
            : result.error,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/orgs/$orgSlug/trades"
        params={{ orgSlug }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Trades
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1
            className="text-2xl font-bold text-navy-700"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Trade Detail
          </h1>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${statusConfig.cls}`}
            style={{ fontFamily: 'var(--font-condensed)' }}
          >
            {statusConfig.label}
          </span>
          {t.tradeType === 'swap' ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-navy-700">
              <ArrowRightLeft className="w-4 h-4" /> Swap
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
              <Gift className="w-4 h-4" /> Giveaway
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-danger-bg border border-red-200 rounded-lg px-6 py-3 text-sm text-danger flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Offering Side */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-navy-700 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>
              Offering
            </h2>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">Staff Member</label>
              <div className="text-sm font-medium text-navy-700">{t.offeringStaffName}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Schedule</label>
              <div className="text-sm text-gray-700">{t.offeringScheduleName}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Time</label>
              <div className="text-sm text-gray-700">
                {formatDatetime(t.offeringStartDatetime)} – {formatDatetime(t.offeringEndDatetime)}
              </div>
              {t.offeringIsPartial && (
                <span className="text-xs text-amber-600 font-medium mt-0.5 inline-block">
                  Partial shift trade
                </span>
              )}
            </div>
            {t.offeringPosition && (
              <div>
                <label className="text-xs text-gray-500 font-medium">Position</label>
                <div className="text-sm text-gray-700">{t.offeringPosition}</div>
              </div>
            )}
          </div>
        </div>

        {/* Receiving Side */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-navy-700 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>
              {t.tradeType === 'swap' ? 'Receiving' : 'Picked Up By'}
            </h2>
          </div>
          <div className="px-6 py-4 space-y-3">
            {t.receivingStaffName ? (
              <>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Staff Member</label>
                  <div className="text-sm font-medium text-navy-700">{t.receivingStaffName}</div>
                </div>
                {t.tradeType === 'swap' && t.receivingScheduleName && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 font-medium">Schedule</label>
                      <div className="text-sm text-gray-700">{t.receivingScheduleName}</div>
                    </div>
                    {t.receivingStartDatetime && t.receivingEndDatetime && (
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Time</label>
                        <div className="text-sm text-gray-700">
                          {formatDatetime(t.receivingStartDatetime)} –{' '}
                          {formatDatetime(t.receivingEndDatetime)}
                        </div>
                        {t.receivingIsPartial && (
                          <span className="text-xs text-amber-600 font-medium mt-0.5 inline-block">
                            Partial shift trade
                          </span>
                        )}
                      </div>
                    )}
                    {t.receivingPosition && (
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Position</label>
                        <div className="text-sm text-gray-700">{t.receivingPosition}</div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-400 italic py-4">
                {t.isOpenBoard
                  ? 'Waiting for someone to claim this trade'
                  : 'Waiting for response'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Eligibility Warnings */}
      {warnings.length > 0 && (
        <div className="bg-warning-bg border border-amber-200 rounded-lg px-6 py-4">
          <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-4 h-4" /> Eligibility Warnings
          </h3>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            {warnings.map((w, i) => (
              <li key={i}>
                {w.type.replace(/_/g, ' ')}
                {w.certTypeName ? `: ${w.certTypeName}` : ''}
                {w.expiresAt ? ` (expires ${w.expiresAt})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reason / Denial */}
      {t.reason && (
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-4">
          <label className="text-xs text-gray-500 font-medium">Reason</label>
          <div className="text-sm text-gray-700 mt-0.5">{t.reason}</div>
        </div>
      )}
      {t.denialReason && (
        <div className="bg-danger-bg border border-red-200 rounded-lg px-6 py-4">
          <label className="text-xs text-danger font-medium">Denial Reason</label>
          <div className="text-sm text-danger mt-0.5">{t.denialReason}</div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-lg px-6 py-4">
        <h3 className="text-sm font-semibold text-navy-700 mb-3">Timeline</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            Created {formatDatetime(t.createdAt)}
          </div>
          {t.acceptedAt && (
            <div className="flex items-center gap-2 text-gray-600">
              <Check className="w-3.5 h-3.5 text-green-500" />
              Accepted {formatDatetime(t.acceptedAt)}
            </div>
          )}
          {t.reviewedAt && (
            <div className="flex items-center gap-2 text-gray-600">
              {t.status === 'approved' ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <X className="w-3.5 h-3.5 text-red-500" />
              )}
              {t.status === 'approved' ? 'Approved' : 'Denied'} {formatDatetime(t.reviewedAt)}
              {t.reviewerName && ` by ${t.reviewerName}`}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {isActive && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Employee actions */}
          {t.status === 'pending_acceptance' && t.tradeType === 'giveaway' && t.isOpenBoard && (
            <button
              onClick={() => void handleAcceptGiveaway()}
              disabled={busy}
              className="px-4 py-2 rounded-md bg-red-700 text-white text-sm font-medium hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Claiming...' : 'Pick Up Shift'}
            </button>
          )}
          <button
            onClick={() => void handleWithdraw()}
            disabled={busy}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Withdraw
          </button>

          {/* Manager actions */}
          {canApprove && t.status === 'pending_approval' && (
            <>
              <div className="border-l border-gray-300 h-8 mx-1" />
              <button
                onClick={() => void handleReview('approved')}
                disabled={busy}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-md text-sm font-medium bg-success-bg text-success hover:opacity-80 disabled:opacity-50 transition-opacity"
              >
                <Check className="w-4 h-4" /> Approve Trade
              </button>
              {showDenyForm ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    className="w-48 px-3 py-2 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
                  />
                  <button
                    onClick={() => void handleReview('denied')}
                    disabled={busy}
                    className="px-3 py-2 rounded-md text-sm font-medium text-danger hover:opacity-80 disabled:opacity-50"
                  >
                    Confirm Deny
                  </button>
                  <button
                    onClick={() => setShowDenyForm(false)}
                    className="text-sm text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDenyForm(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-md text-sm font-medium bg-danger-bg text-danger hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  <X className="w-4 h-4" /> Deny Trade
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
