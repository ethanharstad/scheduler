# Product Roadmap

Future features planned for the emergency services workforce management platform. Items are removed from here and added to `FEATURES.md` once implemented.

For development principles and strategic context, see `specs/roadmap.md`.

---

## Shift Trading & Coverage

*High-value collaboration feature; major pain point in existing tools.*

- Overtime and eligibility enforcement at the point of swap (currently warnings only, not enforced)
- Partial coverage requests — allow multiple staff to each cover a time slice of a single open shift (workaround: manager posts separate coverage requests for each time slice)

**Exit criteria:** Overtime rules block ineligible trades automatically; a single open shift can be split across multiple volunteers.

---

## Communication & Notifications (Remaining)

*Foundation shipped — in-app notifications, email channel, and preferences. Remaining items:*

- Browser push notifications
- Department-level announcements (broadcast to all staff or a station)
- SMS notification channel
- Notification integrations for schedule publish, cert expirations, coverage requests, and open shifts

**Exit criteria:** A manager posting an open shift triggers an immediate notification to all eligible staff.

---

## Leave & Time Management

*Required for accurate payroll prep and fairness.*

- Leave types: vacation, sick, FMLA, bereavement, comp time, unpaid
- Accrual rules per leave type and employment category (career vs. volunteer)
- Leave request and manager approval workflow
- Accrual balance visibility for staff and managers
- Conflict detection: leave requests vs. scheduled shifts / minimum staffing

**Exit criteria:** Staff can request and track leave; managers see balances and approve or deny; approved leave automatically marks shifts as open.

---

## Payroll Integration & Reporting

*Export-first; no in-house payroll engine.*

- Time & attendance: shift clock-in/out with overtime rules (FLSA, union agreements)
- Pay period summaries per employee (regular hours, OT, differentials)
- Export to ADP, QuickBooks, Gusto (CSV and API where supported)
- Compliance reports: hours by role, cert coverage, minimum staffing adherence
- Manager dashboards: staffing gaps, overtime spend, leave usage

**Exit criteria:** A payroll admin can export a clean pay-period report and import it into an external payroll system without manual cleanup.

---

## Monetization & Growth

*Operationalize the SaaS business.*

- Tiered plan definition and feature gates (Free / Basic / Pro)
- Stripe billing integration: subscription management, invoicing, upgrades/downgrades
- Usage metering (seat counts, storage)
- Trial / onboarding funnel for new departments
- Mobile experience: PWA optimization for field access
- Public API for third-party integrations (CAD systems, NFIRS, etc.)

**Exit criteria:** A new department can self-serve onboard, choose a plan, and pay via credit card.

---

## Remaining Enhancements to Existing Features

### Scheduling
- Schedule publishing and versioning (draft → published workflow)
- Schedule generation from platoon templates to produce recurring shift calendars
- Schedule validation: flag/block assignment of uncertified staff
- Restore assignments from platoon schedule after a constraint is removed — "Apply Constraints" is destructive and does not recreate assignments when an unavailability or time-off constraint is later deleted or rejected; a targeted re-populate scoped to a specific staff member and date range (skipping dates that already have an overlapping assignment) would fill this gap

### Qualifications & Compliance
- Certification expiration alerts to staff member and manager
- Compliance audit reporting

### Organization Hierarchy
- Department and sub-department support within orgs
- Department-scoped roles and data visibility
