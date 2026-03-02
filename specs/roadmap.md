# Product Roadmap: Emergency Services Workforce Management SaaS

## Context

This application is a SaaS workforce management platform purpose-built for emergency services organizations — fire departments, EMS, and law enforcement — including professional, volunteer, and combination departments. It replaces expensive, rigid incumbent tools like Telestaff by offering a modern, flexible, and affordable alternative.

**Current state:** User authentication is complete (001-user-auth). The roadmap below governs all future development.

**Tech stack:** TanStack Start v1 + Cloudflare Workers + D1 (SQLite) + React 19 + TypeScript strict.

---

## Strategic Foundation

| Dimension | Decision |
|---|---|
| Deployment | SaaS, multi-tenant |
| Tenant hierarchy | Organization → Departments → Stations |
| Monetization | Tiered plans (Free / Basic / Pro) |
| Payroll | Phase 7 — export/integration only (ADP, QuickBooks, Gusto) |
| Scheduling | All patterns: 24/48, 24/72, Kelly/rotating, volunteer on-call, custom |

---

## Roadmap

### Phase 1 — Organization & Tenant Foundation
*Everything else depends on this being correct.*

- Multi-tenant data model: Org > Department > Station hierarchy
- Org/department onboarding flow (admin self-signup and setup wizard)
- Role-based access control: Owner, Admin, Manager, Employee, Payroll/HR — scoped per level
- Staff directory: invite, manage, deactivate members
- Station and unit management (apparatus, positions)

**Exit criteria:** A department admin can sign up, create their org structure, invite staff, and assign roles.

---

### Phase 2 — Core Scheduling Engine
*The primary product. Must handle all emergency-services shift patterns.*

- Shift templates: 24/48, 24/72, Kelly (multi-platoon rotating), custom
- Volunteer availability management (staff sets availability windows)
- Schedule generation: apply templates to produce recurring shift calendars
- Schedule publishing and versioning (draft → published)
- Views: calendar (daily/weekly/monthly), roster view per shift
- Minimum staffing rules per position/shift (define required headcount by role)

**Exit criteria:** A scheduler can generate a 6-month rolling schedule using a Kelly rotation, publish it, and staff can view their assignments.

---

### Phase 3 — Qualifications & Compliance
*Critical differentiator for emergency services — ensures only eligible staff are scheduled.*

- Certification and license tracking (EMT-B, AEMT, Paramedic, FF I/II, etc.)
- Expiration tracking with alerts
- Position eligibility rules: link positions to required certifications
- Schedule validation: flag/block assignment of uncertified staff
- Compliance audit log

**Exit criteria:** A shift requiring a Paramedic cannot be filled by an EMT-B; expiring certs trigger alerts to the staff member and manager.

---

### Phase 4 — Shift Trading & Coverage
*High-value collaboration feature; major pain point in existing tools.*

- Staff-initiated shift trade requests (offer to another named staff member)
- Open shift posting (offer shift to any eligible staff)
- Manager approval workflows for all trades and pickups
- Coverage request from manager (solicit volunteers for an open shift)
- Overtime and eligibility enforcement at the point of swap

**Exit criteria:** An employee can request a trade, a qualified colleague can accept, and a manager can approve or deny — all in-app.

---

### Phase 5 — Communication & Notifications
*Keeps staff informed without external tools.*

- In-app notification center (schedule changes, open shifts, trade requests, cert expirations)
- Email and browser push notifications
- Department-level announcements (broadcast to all staff or a station)
- Notification preferences (staff controls what they receive)

**Exit criteria:** A manager posting an open shift triggers an immediate notification to all eligible staff.

---

### Phase 6 — Leave & Time Management
*Required for accurate payroll prep and fairness.*

- Leave types: vacation, sick, FMLA, bereavement, comp time, unpaid
- Accrual rules per leave type and employment category (career vs. volunteer)
- Leave request and manager approval workflow
- Accrual balance visibility for staff and managers
- Conflict detection: leave requests vs. scheduled shifts / minimum staffing

**Exit criteria:** Staff can request and track leave; managers see balances and approve or deny; approved leave automatically marks shifts as open.

---

### Phase 7 — Payroll Integration & Reporting
*Export-first; no in-house payroll engine.*

- Time & attendance: shift clock-in/out with overtime rules (FLSA, union agreements)
- Pay period summaries per employee (regular hours, OT, differentials)
- Export to ADP, QuickBooks, Gusto (CSV and API where supported)
- Compliance reports: hours by role, cert coverage, minimum staffing adherence
- Manager dashboards: staffing gaps, overtime spend, leave usage

**Exit criteria:** A payroll admin can export a clean pay-period report and import it into an external payroll system without manual cleanup.

---

### Phase 8 — Monetization & Growth
*Operationalize the SaaS business.*

- Tiered plan definition and feature gates (Free / Basic / Pro)
- Stripe billing integration: subscription management, invoicing, upgrades/downgrades
- Usage metering (seat counts, storage)
- Trial / onboarding funnel for new departments
- Mobile experience: PWA optimization for field access
- Public API for third-party integrations (CAD systems, NFIRS, etc.)

**Exit criteria:** A new department can self-serve onboard, choose a plan, and pay via credit card.

---

## Development Principles

1. **Emergency services first** — every feature must account for volunteer vs. career staff differences and the life-safety implications of understaffing.
2. **Hierarchy awareness** — data access, reporting, and billing all flow through the Org > Dept > Station hierarchy.
3. **Mobile usability** — field personnel check schedules from phones; every screen must work well on small viewports.
4. **Correctness over speed** — scheduling errors in emergency services have real-world consequences; prefer validation over flexibility.
