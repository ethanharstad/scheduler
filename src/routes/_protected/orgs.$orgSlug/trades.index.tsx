import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { ArrowRightLeft, Gift, XCircle } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { ShiftTradeView, TradeStatus } from '@/lib/trade.types'
import {
  listTradesServerFn,
  listOpenBoardTradesServerFn,
  acceptTradeServerFn,
  withdrawTradeServerFn,
  declineTradeServerFn,
} from '@/server/trades'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/trades/')({
  head: () => ({
    meta: [{ title: 'Trades | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const [myResult, boardResult] = await Promise.all([
      listTradesServerFn({ data: { orgSlug: params.orgSlug } }),
      listOpenBoardTradesServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      myTrades: myResult.success ? myResult.trades : [],
      openBoard: boardResult.success ? boardResult.trades : [],
      noStaffRecord: !myResult.success && 'error' in myResult && myResult.error === 'NO_STAFF_RECORD',
    }
  },
  component: TradesIndexPage,
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

const STATUS_CONFIG: Record<TradeStatus, { label: string; cls: string }> = {
  pending_acceptance: { label: 'Pending Acceptance', cls: 'bg-warning-bg text-warning' },
  pending_approval: { label: 'Pending Approval', cls: 'bg-blue-50 text-blue-700' },
  approved: { label: 'Approved', cls: 'bg-success-bg text-success' },
  denied: { label: 'Denied', cls: 'bg-danger-bg text-danger' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-gray-100 text-gray-600' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-500' },
  cancelled_system: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
}

function StatusBadge({ status }: { status: TradeStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${config.cls}`}
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {config.label}
    </span>
  )
}

function TypeBadge({ type }: { type: 'swap' | 'giveaway' }) {
  return type === 'swap' ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-navy-700">
      <ArrowRightLeft className="w-3.5 h-3.5" /> Swap
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
      <Gift className="w-3.5 h-3.5" /> Giveaway
    </span>
  )
}

function TradesIndexPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { orgSlug } = Route.useParams()
  const loaderData = Route.useLoaderData()

  const [myTrades, setMyTrades] = useState<ShiftTradeView[]>(loaderData.myTrades)
  const [openBoard, setOpenBoard] = useState<ShiftTradeView[]>(loaderData.openBoard)
  const [tab, setTab] = useState<'board' | 'mine'>('board')
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null)

  const canSubmit = canDo(userRole, 'submit-trade')

  async function handleWithdraw(tradeId: string) {
    setActionBusy(tradeId)
    try {
      const result = await withdrawTradeServerFn({ data: { orgSlug, tradeId } })
      if (result.success) {
        setMyTrades((prev) =>
          prev.map((t) => (t.id === tradeId ? { ...t, status: 'withdrawn' as TradeStatus } : t)),
        )
        setOpenBoard((prev) => prev.filter((t) => t.id !== tradeId))
      }
    } finally {
      setActionBusy(null)
      setConfirmAction(null)
    }
  }

  async function handleDecline(tradeId: string) {
    setActionBusy(tradeId)
    try {
      const result = await declineTradeServerFn({ data: { orgSlug, tradeId } })
      if (result.success) {
        setMyTrades((prev) =>
          prev.map((t) => (t.id === tradeId ? { ...t, status: 'withdrawn' as TradeStatus } : t)),
        )
      }
    } finally {
      setActionBusy(null)
      setConfirmAction(null)
    }
  }

  async function handleClaimGiveaway(tradeId: string) {
    setActionBusy(tradeId)
    try {
      const result = await acceptTradeServerFn({ data: { orgSlug, tradeId } })
      if (result.success) {
        setOpenBoard((prev) => prev.filter((t) => t.id !== tradeId))
        setMyTrades((prev) => [result.trade, ...prev])
      }
    } finally {
      setActionBusy(null)
    }
  }

  const activeTrades = myTrades.filter(
    (t) => t.status === 'pending_acceptance' || t.status === 'pending_approval',
  )
  const pastTrades = myTrades.filter(
    (t) => t.status !== 'pending_acceptance' && t.status !== 'pending_approval',
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold text-navy-700"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Shift Trades
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{org.name}</p>
        </div>
      </div>

      {loaderData.noStaffRecord && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-4 text-sm text-blue-700">
          You don't have a staff roster entry. Ask an admin to add you to Staff before trading
          shifts.
        </div>
      )}

      {/* Sub-tabs: Board / My Trades */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('board')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'board'
              ? 'bg-navy-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Open Board ({openBoard.length})
        </button>
        <button
          onClick={() => setTab('mine')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'mine'
              ? 'bg-navy-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          My Trades ({myTrades.length})
        </button>
      </div>

      {/* Open Board */}
      {tab === 'board' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-navy-700">Open Shift Trades</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Shifts posted by staff looking for coverage or a swap
            </p>
          </div>
          {openBoard.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-500 text-center">
              No open trades on the board right now.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {openBoard.map((t) => (
                <div key={t.id} className="px-6 py-4 hover:bg-gray-50 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-navy-700">{t.offeringStaffName}</span>
                      <TypeBadge type={t.tradeType} />
                      {t.offeringIsPartial && (
                        <span className="text-xs text-amber-600 font-medium">Partial</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {t.offeringScheduleName} &middot;{' '}
                      {formatDateRange(t.offeringStartDatetime, t.offeringEndDatetime)}
                    </div>
                    {t.offeringPosition && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Position: {t.offeringPosition}
                      </div>
                    )}
                    {t.reason && (
                      <div className="text-xs text-gray-400 mt-1 italic">{t.reason}</div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {canSubmit && t.tradeType === 'giveaway' && (
                      <button
                        onClick={() => void handleClaimGiveaway(t.id)}
                        disabled={actionBusy === t.id}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
                      >
                        {actionBusy === t.id ? 'Claiming...' : 'Pick Up'}
                      </button>
                    )}
                    {canSubmit && t.tradeType === 'swap' && (
                      <Link
                        to="/orgs/$orgSlug/trades/$tradeId"
                        params={{ orgSlug, tradeId: t.id }}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-700 text-white hover:bg-red-800 transition-colors inline-block"
                      >
                        View & Offer Swap
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Trades */}
      {tab === 'mine' && (
        <div className="space-y-4">
          {/* Active */}
          {activeTrades.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-navy-700">Active</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {activeTrades.map((t) => (
                  <TradeRow
                    key={t.id}
                    trade={t}
                    orgSlug={orgSlug}
                    actionBusy={actionBusy}
                    confirmAction={confirmAction}
                    onWithdraw={handleWithdraw}
                    onDecline={handleDecline}
                    onConfirmAction={setConfirmAction}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {pastTrades.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-navy-700">History</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {pastTrades.map((t) => (
                  <TradeRow
                    key={t.id}
                    trade={t}
                    orgSlug={orgSlug}
                    actionBusy={null}
                    confirmAction={null}
                    onWithdraw={() => {}}
                    onDecline={() => {}}
                    onConfirmAction={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {myTrades.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg px-6 py-8 text-sm text-gray-500 text-center">
              You haven't participated in any trades yet.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TradeRow({
  trade: t,
  orgSlug,
  actionBusy,
  confirmAction,
  onWithdraw,
  onDecline,
  onConfirmAction,
}: {
  trade: ShiftTradeView
  orgSlug: string
  actionBusy: string | null
  confirmAction: { id: string; action: string } | null
  onWithdraw: (id: string) => void
  onDecline: (id: string) => void
  onConfirmAction: (v: { id: string; action: string } | null) => void
}) {
  const isActive = t.status === 'pending_acceptance' || t.status === 'pending_approval'

  return (
    <div className="px-6 py-4 hover:bg-gray-50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <TypeBadge type={t.tradeType} />
            <StatusBadge status={t.status} />
            {t.isOpenBoard && (
              <span className="text-xs text-gray-400 font-medium">Board Post</span>
            )}
            {t.offeringIsPartial && (
              <span className="text-xs text-amber-600 font-medium">Partial</span>
            )}
          </div>
          <div className="text-sm text-gray-700 mt-1">
            <span className="font-medium text-navy-700">{t.offeringStaffName}</span>
            {' offers '}
            <span className="text-gray-600">
              {t.offeringScheduleName} &middot;{' '}
              {formatDateRange(t.offeringStartDatetime, t.offeringEndDatetime)}
            </span>
            {t.offeringPosition && (
              <span className="text-gray-500"> ({t.offeringPosition})</span>
            )}
          </div>
          {t.receivingStaffName && (
            <div className="text-sm text-gray-700 mt-0.5">
              <span className="font-medium text-navy-700">{t.receivingStaffName}</span>
              {' offers '}
              <span className="text-gray-600">
                {t.receivingScheduleName && `${t.receivingScheduleName} \u00b7 `}
                {t.receivingStartDatetime &&
                  t.receivingEndDatetime &&
                  formatDateRange(t.receivingStartDatetime, t.receivingEndDatetime)}
              </span>
              {t.receivingPosition && (
                <span className="text-gray-500"> ({t.receivingPosition})</span>
              )}
            </div>
          )}
          {t.reason && <div className="text-xs text-gray-400 mt-1 italic">{t.reason}</div>}
          {t.denialReason && (
            <div className="text-xs text-danger mt-1">Reason: {t.denialReason}</div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Link
            to="/orgs/$orgSlug/trades/$tradeId"
            params={{ orgSlug, tradeId: t.id }}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Details
          </Link>
          {isActive && confirmAction?.id === t.id ? (
            <span className="flex items-center gap-1 text-xs text-danger">
              {confirmAction.action === 'withdraw' ? 'Withdraw?' : 'Decline?'}
              <button
                onClick={() =>
                  confirmAction.action === 'withdraw'
                    ? onWithdraw(t.id)
                    : onDecline(t.id)
                }
                disabled={actionBusy === t.id}
                className="underline font-medium disabled:opacity-50"
              >
                Yes
              </button>
              {' / '}
              <button onClick={() => onConfirmAction(null)} className="underline font-medium">
                No
              </button>
            </span>
          ) : isActive ? (
            <button
              onClick={() =>
                onConfirmAction({
                  id: t.id,
                  action: t.status === 'pending_acceptance' ? 'withdraw' : 'withdraw',
                })
              }
              className="p-1.5 rounded text-gray-400 hover:text-danger hover:bg-danger-bg transition-colors"
              title="Withdraw"
            >
              <XCircle className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
