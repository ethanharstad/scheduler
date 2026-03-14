# Product Roadmap

Future features planned for the emergency services workforce management platform. Items are removed from here and added to `FEATURES.md` once implemented.

For development principles and strategic context, see `specs/roadmap.md`.

---

## Shift Trading & Coverage

*High-value collaboration feature; major pain point in existing tools.*

- Staff-initiated shift trade requests (offer to another named staff member)
- Open shift posting (offer shift to any eligible staff)
- Manager approval workflows for all trades and pickups
- Coverage request from manager (solicit volunteers for an open shift)
- Overtime and eligibility enforcement at the point of swap

**Exit criteria:** An employee can request a trade, a qualified colleague can accept, and a manager can approve or deny — all in-app.

---

## Communication & Notifications

*Keeps staff informed without external tools.*

- In-app notification center (schedule changes, open shifts, trade requests, cert expirations)
- Email and browser push notifications
- Department-level announcements (broadcast to all staff or a station)
- Notification preferences (staff controls what they receive)

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

### Qualifications & Compliance
- Certification expiration alerts to staff member and manager
- Compliance audit reporting

### Organization Hierarchy
- Department and sub-department support within orgs
- Department-scoped roles and data visibility
