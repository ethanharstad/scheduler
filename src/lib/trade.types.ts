export type TradeType = 'swap' | 'giveaway'

export type TradeStatus =
  | 'pending_acceptance'
  | 'pending_approval'
  | 'approved'
  | 'denied'
  | 'withdrawn'
  | 'expired'
  | 'cancelled_system'

/** Full trade detail for display */
export interface ShiftTradeView {
  id: string
  tradeType: TradeType
  status: TradeStatus
  isOpenBoard: boolean
  reason: string | null
  denialReason: string | null

  offeringStaffId: string
  offeringStaffName: string
  offeringAssignmentId: string
  offeringScheduleId: string
  offeringScheduleName: string
  offeringStartDatetime: string
  offeringEndDatetime: string
  offeringPosition: string | null
  offeringPositionId: string | null
  /** Whether the trade covers only a portion of the full assignment */
  offeringIsPartial: boolean

  receivingStaffId: string | null
  receivingStaffName: string | null
  receivingAssignmentId: string | null
  receivingScheduleId: string | null
  receivingScheduleName: string | null
  receivingStartDatetime: string | null
  receivingEndDatetime: string | null
  receivingPosition: string | null
  receivingPositionId: string | null
  receivingIsPartial: boolean

  reviewerName: string | null
  reviewedAt: string | null
  acceptedAt: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

/** Input for creating a new trade */
export interface CreateTradeInput {
  orgSlug: string
  offeringAssignmentId: string
  /** Partial trade: start of the traded portion (defaults to assignment start) */
  offeringStartDatetime?: string
  /** Partial trade: end of the traded portion (defaults to assignment end) */
  offeringEndDatetime?: string
  tradeType: TradeType
  isOpenBoard: boolean
  /** Required for directed trades */
  receivingStaffId?: string
  /** Required for directed swap trades */
  receivingAssignmentId?: string
  receivingStartDatetime?: string
  receivingEndDatetime?: string
  reason?: string
}

/** Input for accepting / claiming a trade */
export interface AcceptTradeInput {
  orgSlug: string
  tradeId: string
  /** Required for open board swap claims — the shift offered in return */
  receivingAssignmentId?: string
  receivingStartDatetime?: string
  receivingEndDatetime?: string
}

/** Input for manager review (approve or deny) */
export interface ReviewTradeInput {
  orgSlug: string
  tradeId: string
  decision: 'approved' | 'denied'
  reason?: string
}

/** Simple input for withdraw / decline actions */
export interface TradeActionInput {
  orgSlug: string
  tradeId: string
}

/** Input for listing trades */
export interface ListTradesInput {
  orgSlug: string
  status?: TradeStatus
}

/** Input for getting a single trade */
export interface GetTradeInput {
  orgSlug: string
  tradeId: string
}
