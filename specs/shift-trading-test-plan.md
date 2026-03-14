# Shift Trading — Test Plan

## Server function tests

### Create trade
- [ ] **Directed swap**: Create a swap trade between two staff members with valid assignments; verify `shift_trade` row created with `pending_acceptance` status, correct offering/receiving fields
- [ ] **Directed giveaway**: Create a giveaway directed at a specific staff member; verify no receiving assignment required, status is `pending_acceptance`
- [ ] **Open board swap**: Create open board swap; verify `is_open_board = 1`, `receiving_staff_id` is NULL
- [ ] **Open board giveaway**: Same for giveaway type
- [ ] **Partial shift**: Provide custom `offeringStartDatetime`/`offeringEndDatetime` within the assignment window; verify partial fields stored correctly and `offeringIsPartial` computed as `true` on read
- [ ] **Validation errors**: Self-trade (offering own assignment as receiver), assignment not found, assignment belongs to different staff, past shift, overlapping datetime range for partial trades

### Accept trade
- [ ] **Directed accept**: Receiver accepts a directed swap/giveaway; verify status transitions from `pending_acceptance` to `pending_approval`
- [ ] **Open board claim**: Another staff member claims an open board trade with their assignment; verify `receiving_staff_id`, `receiving_assignment_id` populated, status becomes `pending_approval`
- [ ] **Wrong user**: Non-targeted staff tries to accept a directed trade returns `FORBIDDEN`

### Withdraw / Decline
- [ ] **Decline trade**: Receiver declines directed trade; verify status becomes `withdrawn` and trade no longer active
- [ ] **Withdraw trade**: Offerer withdraws their own trade; verify status becomes `withdrawn`
- [ ] **Withdraw — wrong user**: Non-offerer tries to withdraw returns `FORBIDDEN`

### Review (approve / deny)
- [ ] **Approve**: Manager approves a `pending_approval` trade; verify status becomes `approved`, `reviewer_id` and `reviewed_at` set
- [ ] **Deny**: Manager denies with reason; verify status becomes `denied`, `denial_reason` stored
- [ ] **RBAC**: Employee role tries to review returns `FORBIDDEN`; manager/admin/owner can review

### List / query
- [ ] **My trades**: Returns trades where current user is offerer or receiver
- [ ] **Approvals filter**: Manager sees all `pending_approval` trades for the org
- [ ] **Status filter**: Filter by specific status returns only matching trades

### Edge cases
- [ ] **Lazy expiration**: Create trade for a past offering shift, then call `listTradesServerFn`; verify stale trades auto-expire to `expired` status
- [ ] **Eligibility warnings**: When approving a swap, verify `checkSingleStaffEligibility` warnings returned for the receiving staff if they lack required qualifications for the position
- [ ] **CASCADE — offering deleted**: Delete offering assignment; verify associated trade is cascade-deleted
- [ ] **CASCADE — receiving deleted**: Delete receiving assignment; verify `receiving_assignment_id` set to NULL

## UI / route tests

- [ ] **Trade list page**: Navigate to `/orgs/$orgSlug/trades`; verify "My Trades" and "Open Board" tabs render; verify empty state shown when no trades exist
- [ ] **Trade detail page**: Navigate to `/orgs/$orgSlug/trades/$tradeId`; verify all trade details displayed (both sides, status badge, timestamps)
- [ ] **Action buttons**: Verify correct buttons shown per role and status (Accept/Decline for receiver, Withdraw for offerer, Approve/Deny for manager)
- [ ] **Approvals tab**: Manager navigates to approvals tab; verify pending trades listed with approve/deny controls
- [ ] **Approvals tab — RBAC**: Employee role does not see the Approvals tab
- [ ] **Trade This Shift button**: On schedule detail page, each assignment row shows a trade button; clicking navigates to trade creation
- [ ] **Sidebar nav**: "Shift Trades" nav item appears under Scheduling section with correct icon

## Integration / E2E scenarios

- [ ] **Full swap flow**: Staff A creates directed swap with Staff B → B accepts → Manager approves → verify final state
- [ ] **Full giveaway flow**: Staff A creates open board giveaway → Staff C claims → Manager approves
- [ ] **Denial flow**: Staff A creates trade → B accepts → Manager denies with reason → verify denial reason displayed
- [ ] **Withdraw after acceptance**: Staff A creates trade → B accepts → A withdraws before approval → verify status `withdrawn`
- [ ] **Expired trade**: Create trade for shift starting in 1 minute, wait, verify auto-expiration on next list call
- [ ] **Partial trade display**: Create partial trade, verify UI shows "Partial" badge and correct time range vs full assignment range
