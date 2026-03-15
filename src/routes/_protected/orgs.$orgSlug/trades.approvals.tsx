import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { ArrowRightLeft, Gift, Check, X, AlertTriangle } from 'lucide-react'
import type { ShiftTradeView } from '@/lib/trade.types'
import {
  listPendingTradeApprovalsServerFn,
  reviewTradeServerFn,
} from '@/server/trades'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/trades/approvals')({
  head: () => ({
    meta: [{ title: 'Trade Approvals | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const result = await listPendingTradeApprovalsServerFn({
      data: { orgSlug: params.orgSlug },
    })
    return {
      trades: result.success ? result.trades : [],
      forbidden: !result.success,
    }
  },
  component: TradeApprovalsPage,
})

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDateRange(start: string, end: string): string {
  return `${formatDatetime(start)} – ${formatDatetime(end)}`
}

function TradeApprovalsPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { orgSlug } = Route.useParams()
  const loaderData = Route.useLoaderData()

  const [trades, setTrades] = useState<ShiftTradeView[]>(loaderData.trades)
  const [reviewBusy, setReviewBusy] = useState<string | null>(null)
  const [denyReason, setDenyReason] = useState<Record<string, string>>({})
  const [showDenyForm, setShowDenyForm] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

  async function handleReview(tradeId: string, decision: 'approved' | 'denied') {
    setReviewBusy(tradeId)
    setReviewError(null)
    try {
      const result = await reviewTradeServerFn({
        data: {
          orgSlug,
          tradeId,
          decision,
          reason: decision === 'denied' ? denyReason[tradeId] : undefined,
        },
      })
      if (result.success) {
        setTrades((prev) => prev.filter((t) => t.id !== tradeId))
        setShowDenyForm(null)
      } else {
        setReviewError(
          result.error === 'SELF_REVIEW'
            ? 'You cannot approve your own trade.'
            : result.error,
        )
      }
    } finally {
      setReviewBusy(null)
    }
  }

  if (loaderData.forbidden) {
    return (
      <div className="bg-danger-bg border border-red-200 rounded-lg px-6 py-4 text-sm text-danger">
        You do not have permission to review trade approvals.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold text-navy-700"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Trade Approvals
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{org.name}</p>
      </div>

      {reviewError && (
        <div className="bg-danger-bg border border-red-200 rounded-lg px-6 py-3 text-sm text-danger flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {reviewError}
        </div>
      )}

      {trades.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-8 text-sm text-gray-500 text-center">
          No trades pending approval.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
          {trades.map((t) => (
            <div key={t.id} className="px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {t.tradeType === 'swap' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-navy-700">
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Swap
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <Gift className="w-3.5 h-3.5" /> Giveaway
                      </span>
                    )}
                    {t.offeringIsPartial && (
                      <span className="text-xs text-amber-600 font-medium">Partial Trade</span>
                    )}
                  </div>

                  {/* Offering side */}
                  {t.offeringStaffName && (
                    <div className="text-sm mb-2">
                      <span className="font-semibold text-navy-700">{t.offeringStaffName}</span>
                      <span className="text-gray-500"> gives up:</span>
                      <div className="text-gray-600 ml-4 mt-0.5">
                        {t.offeringScheduleName} &middot;{' '}
                        {t.offeringStartDatetime && t.offeringEndDatetime && formatDateRange(t.offeringStartDatetime, t.offeringEndDatetime)}
                        {t.offeringPosition && (
                          <span className="text-gray-500"> &middot; {t.offeringPosition}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Receiving side */}
                  {t.receivingStaffName && (
                    <div className="text-sm">
                      <span className="font-semibold text-navy-700">{t.receivingStaffName}</span>
                      <span className="text-gray-500">
                        {t.tradeType === 'swap' ? ' gives up:' : ' picks up the shift'}
                      </span>
                      {t.tradeType === 'swap' && t.receivingStartDatetime && t.receivingEndDatetime && (
                        <div className="text-gray-600 ml-4 mt-0.5">
                          {t.receivingScheduleName} &middot;{' '}
                          {formatDateRange(t.receivingStartDatetime, t.receivingEndDatetime)}
                          {t.receivingPosition && (
                            <span className="text-gray-500"> &middot; {t.receivingPosition}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {t.reason && (
                    <div className="text-xs text-gray-400 mt-2 italic">Reason: {t.reason}</div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/orgs/$orgSlug/trades/$tradeId"
                      params={{ orgSlug, tradeId: t.id }}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Details
                    </Link>
                    <button
                      onClick={() => void handleReview(t.id, 'approved')}
                      disabled={reviewBusy === t.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-success-bg text-success hover:opacity-80 disabled:opacity-50 transition-opacity"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    {showDenyForm === t.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="Reason (optional)"
                          value={denyReason[t.id] ?? ''}
                          onChange={(e) =>
                            setDenyReason((prev) => ({ ...prev, [t.id]: e.target.value }))
                          }
                          className="w-40 px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-red-700"
                        />
                        <button
                          onClick={() => void handleReview(t.id, 'denied')}
                          disabled={reviewBusy === t.id}
                          className="px-2 py-1 text-xs font-medium text-danger hover:opacity-80 disabled:opacity-50"
                        >
                          Deny
                        </button>
                        <button
                          onClick={() => setShowDenyForm(null)}
                          className="px-1 py-1 text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDenyForm(t.id)}
                        disabled={reviewBusy === t.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-danger-bg text-danger hover:opacity-80 disabled:opacity-50 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" /> Deny
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
