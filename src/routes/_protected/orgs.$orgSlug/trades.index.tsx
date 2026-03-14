import { useState, useEffect } from 'react'
import { createFileRoute, Link, useNavigate, useRouteContext } from '@tanstack/react-router'
import { ArrowRightLeft, Gift, XCircle, Plus, X, ChevronDown } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { ShiftTradeView, TradeStatus, TradeType, CreateTradeInput } from '@/lib/trade.types'
import type { StaffMemberView } from '@/lib/staff.types'
import type { TradeableAssignment } from '@/server/trades'
import {
  listTradesServerFn,
  listOpenBoardTradesServerFn,
  acceptTradeServerFn,
  withdrawTradeServerFn,
  declineTradeServerFn,
  createTradeServerFn,
  getMyTradeableAssignmentsServerFn,
  getStaffAssignmentsServerFn,
} from '@/server/trades'
import { listStaffServerFn } from '@/server/staff'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/trades/')({
  head: () => ({
    meta: [{ title: 'Trades | Scene Ready' }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    assignmentId: (search.assignmentId as string) || undefined,
  }),
  loader: async ({ params }) => {
    const [myResult, boardResult, assignmentsResult, staffResult] = await Promise.all([
      listTradesServerFn({ data: { orgSlug: params.orgSlug } }),
      listOpenBoardTradesServerFn({ data: { orgSlug: params.orgSlug } }),
      getMyTradeableAssignmentsServerFn({ data: { orgSlug: params.orgSlug } }),
      listStaffServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      myTrades: myResult.success ? myResult.trades : [],
      openBoard: boardResult.success ? boardResult.trades : [],
      myAssignments: assignmentsResult.success ? assignmentsResult.assignments : [],
      staffMembers: staffResult.success ? staffResult.members.filter((m) => m.status !== 'removed') : [],
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

// ---------------------------------------------------------------------------
// Error message helper
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'You are not authorized.',
  FORBIDDEN: 'You do not have permission to create trades.',
  NOT_FOUND: 'The selected assignment or staff member was not found.',
  NO_STAFF_RECORD: 'You are not linked to a staff record. Contact an admin.',
  VALIDATION_ERROR: 'Invalid trade parameters. Check your selections.',
  DRAFT_SCHEDULE: 'Trades can only be created for published schedules.',
  SHIFT_STARTED: 'This shift has already started or is in the past.',
  DUPLICATE_TRADE: 'An active trade already exists for this assignment.',
}

// ---------------------------------------------------------------------------
// Create Trade Form
// ---------------------------------------------------------------------------

function CreateTradeForm({
  orgSlug,
  myAssignments,
  staffMembers,
  preselectedAssignmentId,
  onCreated,
  onCancel,
}: {
  orgSlug: string
  myAssignments: TradeableAssignment[]
  staffMembers: StaffMemberView[]
  preselectedAssignmentId?: string
  onCreated: (trade: ShiftTradeView) => void
  onCancel: () => void
}) {
  const [assignmentId, setAssignmentId] = useState(preselectedAssignmentId ?? '')
  const [tradeType, setTradeType] = useState<TradeType>('swap')
  const [isOpenBoard, setIsOpenBoard] = useState(true)
  const [receivingStaffId, setReceivingStaffId] = useState('')
  const [receivingAssignmentId, setReceivingAssignmentId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Staff assignments for directed swap
  const [receiverAssignments, setReceiverAssignments] = useState<TradeableAssignment[]>([])
  const [loadingReceiverAssignments, setLoadingReceiverAssignments] = useState(false)

  const selectedAssignment = myAssignments.find((a) => a.id === assignmentId)

  // Filter staff to exclude self (the person whose assignment is selected)
  const selfStaffId = selectedAssignment?.staffMemberId
  const otherStaff = staffMembers.filter(
    (m) => m.id !== selfStaffId && m.userId,
  )

  // Fetch receiver's assignments when directed swap is selected
  useEffect(() => {
    if (!isOpenBoard && tradeType === 'swap' && receivingStaffId) {
      setLoadingReceiverAssignments(true)
      setReceivingAssignmentId('')
      getStaffAssignmentsServerFn({ data: { orgSlug, staffMemberId: receivingStaffId } })
        .then((result) => {
          if (result.success) {
            setReceiverAssignments(result.assignments)
          } else {
            setReceiverAssignments([])
          }
        })
        .finally(() => setLoadingReceiverAssignments(false))
    } else {
      setReceiverAssignments([])
      setReceivingAssignmentId('')
    }
  }, [orgSlug, isOpenBoard, tradeType, receivingStaffId])

  // Reset receiver fields when switching to open board
  useEffect(() => {
    if (isOpenBoard) {
      setReceivingStaffId('')
      setReceivingAssignmentId('')
    }
  }, [isOpenBoard])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!assignmentId) return
    setError(null)
    setBusy(true)

    try {
      const input: CreateTradeInput = {
        orgSlug,
        offeringAssignmentId: assignmentId,
        tradeType,
        isOpenBoard,
        reason: reason.trim() || undefined,
      }

      if (!isOpenBoard && receivingStaffId) {
        input.receivingStaffId = receivingStaffId
        if (tradeType === 'swap' && receivingAssignmentId) {
          input.receivingAssignmentId = receivingAssignmentId
        }
      }

      const result = await createTradeServerFn({ data: input })
      if (result.success) {
        onCreated(result.trade)
      } else {
        setError(ERROR_MESSAGES[result.error] ?? 'Something went wrong.')
      }
    } catch {
      setError('An unexpected error occurred.')
    } finally {
      setBusy(false)
    }
  }

  const canSubmitForm =
    assignmentId &&
    (isOpenBoard || receivingStaffId) &&
    (isOpenBoard || tradeType !== 'swap' || receivingAssignmentId)

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-base font-semibold text-navy-700">New Trade</h2>
        <button
          onClick={onCancel}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 space-y-5">
        {/* Assignment picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Shift to trade
          </label>
          {myAssignments.length === 0 ? (
            <p className="text-sm text-gray-500">
              You have no upcoming shifts in published schedules available to trade.
            </p>
          ) : (
            <select
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-700 focus:ring-1 focus:ring-red-700 outline-none"
            >
              <option value="">Select a shift…</option>
              {myAssignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.scheduleName} — {formatDateRange(a.startDatetime, a.endDatetime)}
                  {a.position ? ` (${a.position})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedAssignment && (
          <>
            {/* Trade type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trade type
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTradeType('swap')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    tradeType === 'swap'
                      ? 'border-navy-700 bg-navy-700/5 text-navy-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Swap
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTradeType('giveaway')
                    setReceivingAssignmentId('')
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    tradeType === 'giveaway'
                      ? 'border-green-700 bg-green-700/5 text-green-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Gift className="w-4 h-4" />
                  Give Away
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                {tradeType === 'swap'
                  ? 'Exchange shifts with another staff member.'
                  : 'Give your shift to someone else without receiving one in return.'}
              </p>
            </div>

            {/* Audience: open board vs directed */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Who can accept?
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpenBoard(true)}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    isOpenBoard
                      ? 'border-navy-700 bg-navy-700/5 text-navy-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Anyone (Open Board)
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpenBoard(false)}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    !isOpenBoard
                      ? 'border-navy-700 bg-navy-700/5 text-navy-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Specific Person
                </button>
              </div>
            </div>

            {/* Directed trade: staff picker */}
            {!isOpenBoard && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Send to
                </label>
                <select
                  value={receivingStaffId}
                  onChange={(e) => setReceivingStaffId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-700 focus:ring-1 focus:ring-red-700 outline-none"
                >
                  <option value="">Select a staff member…</option>
                  {otherStaff.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.email ? ` (${m.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Directed swap: receiver assignment picker */}
            {!isOpenBoard && tradeType === 'swap' && receivingStaffId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Their shift to swap
                </label>
                {loadingReceiverAssignments ? (
                  <p className="text-sm text-gray-400">Loading shifts…</p>
                ) : receiverAssignments.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No upcoming published shifts found for this person.
                  </p>
                ) : (
                  <select
                    value={receivingAssignmentId}
                    onChange={(e) => setReceivingAssignmentId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-700 focus:ring-1 focus:ring-red-700 outline-none"
                  >
                    <option value="">Select their shift…</option>
                    {receiverAssignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.scheduleName} — {formatDateRange(a.startDatetime, a.endDatetime)}
                        {a.position ? ` (${a.position})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Family event, doctor appointment"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-700 focus:ring-1 focus:ring-red-700 outline-none"
                maxLength={200}
              />
            </div>

            {error && (
              <div className="bg-danger-bg border border-danger/20 rounded-md px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={busy || !canSubmitForm}
                className="px-5 py-2 rounded-md text-sm font-medium bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Creating…' : 'Create Trade'}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function TradesIndexPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { orgSlug } = Route.useParams()
  const { assignmentId: searchAssignmentId } = Route.useSearch()
  const navigate = useNavigate()
  const loaderData = Route.useLoaderData()

  const [myTrades, setMyTrades] = useState<ShiftTradeView[]>(loaderData.myTrades)
  const [openBoard, setOpenBoard] = useState<ShiftTradeView[]>(loaderData.openBoard)
  const [tab, setTab] = useState<'board' | 'mine'>('board')
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null)
  const [showForm, setShowForm] = useState(!!searchAssignmentId)

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

  function handleTradeCreated(trade: ShiftTradeView) {
    setMyTrades((prev) => [trade, ...prev])
    if (trade.isOpenBoard) {
      setOpenBoard((prev) => [trade, ...prev])
    }
    setShowForm(false)
    setTab('mine')
    // Clear the assignmentId search param
    void navigate({ to: '/orgs/$orgSlug/trades', params: { orgSlug }, search: {}, replace: true })
  }

  function handleCancelForm() {
    setShowForm(false)
    void navigate({ to: '/orgs/$orgSlug/trades', params: { orgSlug }, search: {}, replace: true })
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
        {canSubmit && !showForm && !loaderData.noStaffRecord && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-red-700 text-white hover:bg-red-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Trade
          </button>
        )}
      </div>

      {loaderData.noStaffRecord && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-4 text-sm text-blue-700">
          You don't have a staff roster entry. Ask an admin to add you to Staff before trading
          shifts.
        </div>
      )}

      {/* Create Trade Form */}
      {showForm && canSubmit && (
        <CreateTradeForm
          orgSlug={orgSlug}
          myAssignments={loaderData.myAssignments}
          staffMembers={loaderData.staffMembers}
          preselectedAssignmentId={searchAssignmentId}
          onCreated={handleTradeCreated}
          onCancel={handleCancelForm}
        />
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
