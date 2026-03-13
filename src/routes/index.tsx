import { createFileRoute, Link } from '@tanstack/react-router'
import { Calendar, Award, RefreshCw, Clock, DollarSign, ArrowRight, Shield, HeartPulse, Flame } from 'lucide-react'
import Header from '../components/Header'

export const Route = createFileRoute('/')({ component: LandingPage })

// ─── Mock UI Panels ──────────────────────────────────────────────────────────

function SchedulingPanel() {
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const dates = ['10', '11', '12', '13', '14', '15', '16']
  const platoons = [
    { name: 'A', color: 'bg-navy-500/80 border-navy-300/30 text-navy-100', active: [true, false, false, true, false, false, true] },
    { name: 'B', color: 'bg-red-700/50 border-red-300/25 text-red-300', active: [false, true, false, false, true, false, false] },
    { name: 'C', color: 'bg-success/20 border-success/30 text-success-light', active: [false, false, true, false, false, true, false] },
  ]
  const roster = [
    { name: 'Martinez, R.', role: 'CAPT', platoon: 'A' },
    { name: 'Chen, T.', role: 'FF/PM', platoon: 'B' },
    { name: 'O\'Brien, S.', role: 'LT', platoon: 'A' },
    { name: 'Wallace, D.', role: 'FF', platoon: 'C' },
  ]

  return (
    <div className="bg-navy-900/90 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <span className="text-white/70 text-xs uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>
          Station 7 · March 2026
        </span>
        <span className="text-red-500 text-[10px] font-mono flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          LIVE
        </span>
      </div>
      <div className="p-4">
        {/* Week grid */}
        <div className="grid grid-cols-8 gap-1 mb-3 text-center">
          <div />
          {days.map((d, i) => (
            <div key={d}>
              <div className="text-white/30 text-[9px] uppercase tracking-wide">{d}</div>
              <div className="text-white/60 text-[11px] font-mono mt-0.5">{dates[i]}</div>
            </div>
          ))}
        </div>
        {platoons.map((p) => (
          <div key={p.name} className="grid grid-cols-8 gap-1 mb-1.5">
            <div className="flex items-center text-white/40 text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-condensed)' }}>
              {p.name}
            </div>
            {p.active.map((on, i) => (
              <div
                key={i}
                className={`h-7 rounded text-[9px] flex items-center justify-center border font-mono ${on ? p.color : 'border-transparent'}`}
              >
                {on ? '24h' : ''}
              </div>
            ))}
          </div>
        ))}
        {/* Roster strip */}
        <div className="mt-4 pt-3 border-t border-white/8 space-y-1.5">
          {roster.map((m) => (
            <div key={m.name} className="flex items-center justify-between">
              <span className="text-white/65 text-[11px]">{m.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-white/30 text-[9px] font-mono">{m.role}</span>
                <span className={`text-[9px] font-condensed uppercase tracking-wide px-1.5 py-0.5 rounded ${
                  m.platoon === 'A' ? 'bg-navy-500/60 text-navy-100' :
                  m.platoon === 'B' ? 'bg-red-700/40 text-red-300' :
                  'bg-success/15 text-success-light'
                }`} style={{ fontFamily: 'var(--font-condensed)' }}>
                  {m.platoon}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2.5 border-t border-white/8 flex items-center justify-between">
          <span className="text-white/30 text-[10px]">Min staffing: <span className="text-success">MET</span></span>
          <span className="text-white/30 text-[10px]">3 open shifts</span>
        </div>
      </div>
    </div>
  )
}

function QualificationsPanel() {
  const certs = [
    { name: 'Paramedic (NR)', holder: 'Martinez, R.', badge: 'CURRENT', cls: 'text-success bg-success/10' },
    { name: 'Hazmat Operations', holder: 'Chen, T.', badge: 'EXPIRING', cls: 'text-warning bg-warning/10' },
    { name: 'Firefighter II', holder: 'O\'Brien, S.', badge: 'CURRENT', cls: 'text-success bg-success/10' },
    { name: 'ACLS Certification', holder: 'Wallace, D.', badge: 'EXPIRED', cls: 'text-danger bg-danger/10' },
    { name: 'Swift Water Rescue', holder: 'Kim, J.', badge: 'CURRENT', cls: 'text-success bg-success/10' },
  ]
  return (
    <div className="bg-navy-900/90 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <span className="text-white/70 text-xs uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>Certification Tracker</span>
        <span className="text-warning text-[10px] font-condensed uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>2 Alerts</span>
      </div>
      <div className="p-4 space-y-0">
        {certs.map((cert) => (
          <div key={cert.name} className="flex items-center justify-between py-2.5 border-b border-white/6 last:border-0">
            <div>
              <div className="text-white/80 text-xs font-medium">{cert.name}</div>
              <div className="text-white/30 text-[10px] font-mono mt-0.5">{cert.holder}</div>
            </div>
            <span
              className={`text-[9px] font-condensed uppercase tracking-wider px-2.5 py-1 rounded-full ${cert.cls}`}
              style={{ fontFamily: 'var(--font-condensed)' }}
            >
              {cert.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShiftTradingPanel() {
  const trades = [
    { from: 'Santos, M.', to: 'Williams, K.', date: 'Mar 18', shift: '0700–1900', status: 'Pending', cls: 'text-warning', qual: true },
    { from: 'Torres, L.', to: 'Davis, R.', date: 'Mar 22', shift: '1900–0700', status: 'Approved', cls: 'text-success', qual: true },
    { from: 'Park, J.', to: 'Thompson, A.', date: 'Mar 25', shift: '0700–1900', status: 'Qual Mismatch', cls: 'text-danger', qual: false },
  ]
  return (
    <div className="bg-navy-900/90 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <span className="text-white/70 text-xs uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>Trade Requests</span>
        <span className="text-white/30 text-[10px] font-mono">3 pending</span>
      </div>
      <div className="p-4 space-y-2.5">
        {trades.map((t, i) => (
          <div key={i} className="bg-white/4 border border-white/8 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-white/65 text-[11px] font-mono">{t.from} → {t.to}</span>
              <span className={`text-[9px] font-condensed uppercase tracking-wide ${t.cls}`} style={{ fontFamily: 'var(--font-condensed)' }}>{t.status}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/35 text-[10px]">{t.date}</span>
              <span className="text-white/25 text-[9px] font-mono">{t.shift}</span>
              <span className={`text-[9px] ${t.qual ? 'text-success' : 'text-danger'}`}>
                {t.qual ? '✓ Quals OK' : '✗ Quals Fail'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LeavePanel() {
  const requests = [
    { name: 'Garcia, M.', type: 'Vacation', dates: 'Mar 20–27', balance: '112h left', cls: 'border-info/20 bg-info/6' },
    { name: 'Johnson, T.', type: 'Kelly Day', dates: 'Mar 19', balance: '4 days left', cls: 'border-white/10 bg-white/3' },
    { name: 'Lee, S.', type: 'Sick Leave', dates: 'Mar 14', balance: '80h left', cls: 'border-warning/20 bg-warning/6' },
  ]
  return (
    <div className="bg-navy-900/90 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-white/8">
        <span className="text-white/70 text-xs uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>Leave Management</span>
      </div>
      <div className="p-4 space-y-2 mb-1">
        {requests.map((r) => (
          <div key={r.name} className={`border rounded-lg p-3 ${r.cls}`}>
            <div className="flex items-center justify-between">
              <span className="text-white/80 text-[11px] font-medium">{r.name}</span>
              <span className="text-white/40 text-[9px] uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>{r.type}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-white/30 text-[10px] font-mono">{r.dates}</span>
              <span className="text-white/25 text-[9px]">{r.balance}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mx-4 mb-4 pt-3 border-t border-white/8 grid grid-cols-3 gap-3 text-center">
        {[{ label: 'Vacation', val: '112h' }, { label: 'Comp', val: '24h' }, { label: 'Kelly', val: '4 days' }].map((item) => (
          <div key={item.label}>
            <div className="text-white/75 text-sm font-mono">{item.val}</div>
            <div className="text-white/30 text-[9px] uppercase tracking-wide mt-0.5" style={{ fontFamily: 'var(--font-condensed)' }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PayrollPanel() {
  const rows = [
    { name: 'Martinez, R.', reg: '96h', ot: '8h', total: '104h' },
    { name: 'Chen, T.', reg: '96h', ot: '0h', total: '96h' },
    { name: "O'Brien, S.", reg: '80h', ot: '24h', total: '104h' },
    { name: 'Wallace, D.', reg: '96h', ot: '0h', total: '96h' },
  ]
  return (
    <div className="bg-navy-900/90 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <span className="text-white/70 text-xs uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>Pay Period · Mar 1–15</span>
        <span className="text-white/30 text-[10px] font-mono">15 members</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-4 gap-2 pb-2 mb-2 border-b border-white/8">
          {['Name', 'Reg', 'OT', 'Total'].map((h) => (
            <span key={h} className={`text-[9px] uppercase tracking-wider text-white/30 ${h !== 'Name' ? 'text-right' : ''}`} style={{ fontFamily: 'var(--font-condensed)' }}>{h}</span>
          ))}
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.name} className="grid grid-cols-4 gap-2">
              <span className="text-white/65 text-[11px]">{r.name}</span>
              <span className="text-right text-white/50 text-[11px] font-mono">{r.reg}</span>
              <span className={`text-right text-[11px] font-mono ${r.ot !== '0h' ? 'text-warning' : 'text-white/25'}`}>{r.ot}</span>
              <span className="text-right text-white/80 text-[11px] font-mono">{r.total}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-white/8 flex items-center justify-between">
          <span className="text-success text-[10px]">Export ready</span>
          <div className="flex items-center gap-3">
            <span className="text-white/25 text-[9px] uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>ADP</span>
            <span className="text-white/25 text-[9px] uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>QuickBooks</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Feature Data ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    id: 'scheduling',
    icon: Calendar,
    label: 'Scheduling Engine',
    title: 'Built for 24-Hour Operations',
    description:
      'Build and manage complex shift schedules with platoon rotations, recurring patterns, and multi-station calendar views. Minimum staffing enforcement keeps every position covered — automatically.',
    highlights: ['Platoon rotations & patterns', 'Multi-station calendar', 'Minimum staffing enforcement'],
    panel: <SchedulingPanel />,
  },
  {
    id: 'qualifications',
    icon: Award,
    label: 'Cert Tracking',
    title: 'No Expired Certs on Your Watch',
    description:
      'Track every certification, license, and training record across your department. Automated expiry alerts keep your roster compliant and position-eligible — no surprises on inspection day.',
    highlights: ['Certification & license tracking', 'Automated expiry alerts', 'Position eligibility rules'],
    panel: <QualificationsPanel />,
  },
  {
    id: 'trading',
    icon: RefreshCw,
    label: 'Shift Trading',
    title: 'Coverage Without the Phone Tag',
    description:
      'Staff-initiated shift trades with built-in qualification checks and manager approval workflows. The open shift marketplace fills coverage gaps fast — without compromising position requirements.',
    highlights: ['Staff-initiated trades', 'Open shift marketplace', 'Manager approval workflow'],
    panel: <ShiftTradingPanel />,
  },
  {
    id: 'leave',
    icon: Clock,
    label: 'Leave & Time',
    title: 'Every Leave Type, Every Department',
    description:
      'Vacation, sick, Kelly days, comp time, FMLA — all managed in one place. Built-in accrual tracking and a streamlined request/approval workflow designed for around-the-clock operations.',
    highlights: ['Kelly days, comp time & FMLA', 'Accrual tracking', 'Request & approval workflow'],
    panel: <LeavePanel />,
  },
  {
    id: 'payroll',
    icon: DollarSign,
    label: 'Payroll Export',
    title: 'Time Tracking Tied to Shifts',
    description:
      'Time tracking tied directly to scheduled shifts with automatic overtime calculation. Generate pay period summaries and export to ADP, QuickBooks, or whatever your finance team uses.',
    highlights: ['Shift-linked time tracking', 'Automatic OT calculation', 'ADP & QuickBooks export'],
    panel: <PayrollPanel />,
  },
]

const STATS = [
  { value: '500+', label: 'Departments' },
  { value: '50K+', label: 'Shifts Managed' },
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '3', label: 'Service Disciplines' },
]

const DEPT_TYPES = [
  {
    Icon: Flame,
    label: 'Fire Departments',
    sub: 'Professional, volunteer, & combination departments at any scale.',
  },
  {
    Icon: HeartPulse,
    label: 'EMS Agencies',
    sub: 'Private, municipal, and county emergency medical services.',
  },
  {
    Icon: Shield,
    label: 'Law Enforcement',
    sub: 'Municipal and county agencies with complex shift structures.',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

function LandingPage() {
  return (
    <div className="min-h-screen bg-navy-900">
      <Header />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[88vh] flex flex-col justify-center px-6 py-20 overflow-hidden">
        {/* Dot-grid texture */}
        <div
          className="absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(rgba(197,208,224,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
        {/* Diagonal right-side accent */}
        <div
          className="absolute top-0 right-0 bottom-0 w-1/2 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, transparent 40%, rgba(200,16,46,0.04) 100%)',
            clipPath: 'polygon(35% 0, 100% 0, 100% 100%, 0% 100%)',
          }}
        />
        {/* Top priority strip */}
        <div className="absolute top-0 left-0 right-0 h-px bg-red-700" />

        <div className="relative max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 xl:gap-20 items-center">

            {/* Left: Copy */}
            <div>
              <div className="flex items-center gap-2.5 mb-7">
                <div className="h-px w-8 bg-red-700 flex-shrink-0" />
                <span
                  className="text-red-500 text-[11px] uppercase tracking-[0.18em]"
                  style={{ fontFamily: 'var(--font-condensed)' }}
                >
                  Trusted by Fire · EMS · Law Enforcement
                </span>
              </div>

              <h1
                className="text-white leading-none mb-6"
                style={{
                  fontFamily: 'var(--font-condensed)',
                  fontSize: 'clamp(2.8rem, 7vw, 5.25rem)',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '-0.01em',
                  lineHeight: '0.93',
                }}
              >
                Workforce<br />
                <span className="text-white/45">Management</span><br />
                That Keeps<br />
                <span className="text-red-500">Crews Ready</span>
              </h1>

              <p className="text-white/55 text-lg leading-relaxed mb-8 max-w-[480px]">
                Scheduling, qualifications, shift trading, leave, and payroll — purpose-built for
                the 24-hour operations of emergency services departments.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-lg transition-colors shadow-xl shadow-red-700/30 text-[15px]"
                >
                  Get Started Free
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/login"
                  search={{ from: '/orgs', verified: false, reset: false }}
                  className="inline-flex items-center gap-2 px-7 py-3.5 border border-white/18 hover:border-white/35 text-white/65 hover:text-white font-semibold rounded-lg transition-colors text-[15px]"
                >
                  Sign In
                </Link>
              </div>
              <p className="mt-4 text-white/25 text-xs tracking-wide">
                No credit card required · Free plan available · Set up in minutes
              </p>
            </div>

            {/* Right: Hero panel */}
            <div className="hidden lg:block">
              <SchedulingPanel />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <div className="bg-navy-700/80 border-y border-white/8">
        <div className="max-w-4xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--font-mono)' }}>
                {stat.value}
              </div>
              <div
                className="text-white/35 text-[10px] mt-1 uppercase tracking-[0.15em]"
                style={{ fontFamily: 'var(--font-condensed)' }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature sections ─────────────────────────────────────────────── */}
      {FEATURES.map((feature, index) => {
        const Icon = feature.icon
        return (
          <section
            key={feature.id}
            id={feature.id}
            className={`py-20 px-6 ${index % 2 === 0 ? 'bg-navy-900' : 'bg-navy-700/35'}`}
          >
            <div
              className={`max-w-5xl mx-auto flex flex-col ${
                index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
              } items-center gap-12 lg:gap-16`}
            >
              {/* Text */}
              <div className="flex-1">
                <div className="flex items-center gap-2.5 mb-4">
                  <Icon size={14} className="text-red-500 flex-shrink-0" />
                  <span
                    className="text-red-500 text-[11px] uppercase tracking-[0.15em]"
                    style={{ fontFamily: 'var(--font-condensed)' }}
                  >
                    {feature.label}
                  </span>
                </div>
                <h2
                  className="text-white mb-4"
                  style={{
                    fontFamily: 'var(--font-condensed)',
                    fontSize: 'clamp(1.6rem, 3.5vw, 2.25rem)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '-0.01em',
                    lineHeight: '1.05',
                  }}
                >
                  {feature.title}
                </h2>
                <p className="text-white/55 text-base leading-relaxed mb-6 max-w-[440px]">
                  {feature.description}
                </p>
                <ul className="space-y-2.5">
                  {feature.highlights.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-white/70 text-sm">
                      <span className="w-1.5 h-1.5 bg-red-700 rounded-full flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Mock panel */}
              <div className="flex-1 w-full max-w-md">{feature.panel}</div>
            </div>
          </section>
        )
      })}

      {/* ── Department types ─────────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-navy-700/60 border-t border-white/8">
        <div className="max-w-4xl mx-auto">
          <p
            className="text-white/25 text-[10px] uppercase tracking-[0.2em] text-center mb-8"
            style={{ fontFamily: 'var(--font-condensed)' }}
          >
            Purpose-Built For
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DEPT_TYPES.map(({ Icon, label, sub }) => (
              <div
                key={label}
                className="bg-white/4 border border-white/8 rounded-xl p-5 hover:bg-white/6 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-red-700/20 border border-red-700/25 flex items-center justify-center mb-4">
                  <Icon size={18} className="text-red-500" />
                </div>
                <div className="text-white font-semibold text-sm mb-1.5">{label}</div>
                <div className="text-white/40 text-sm leading-relaxed">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA section ──────────────────────────────────────────────────── */}
      <section className="relative py-24 px-6 bg-navy-900 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(rgba(197,208,224,0.05) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
        <div className="absolute top-0 left-0 right-0 h-px bg-red-700/40" />
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-7">
            <div className="h-px w-10 bg-red-700/60" />
            <span
              className="text-red-500 text-[10px] uppercase tracking-[0.2em]"
              style={{ fontFamily: 'var(--font-condensed)' }}
            >
              Get Started
            </span>
            <div className="h-px w-10 bg-red-700/60" />
          </div>
          <h2
            className="text-white mb-5"
            style={{
              fontFamily: 'var(--font-condensed)',
              fontSize: 'clamp(2.2rem, 6vw, 4rem)',
              fontWeight: 800,
              textTransform: 'uppercase',
              lineHeight: '0.95',
              letterSpacing: '-0.01em',
            }}
          >
            Ready When<br />
            <span className="text-red-500">You Are</span>
          </h2>
          <p className="text-white/50 text-lg mb-8 leading-relaxed">
            Join departments across fire, EMS, and law enforcement who keep their teams
            prepared and compliant with Scene Ready.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-lg transition-colors shadow-xl shadow-red-700/30 text-base"
          >
            Create your organization
            <ArrowRight size={18} />
          </Link>
          <p className="mt-4 text-white/22 text-xs">Free plan available · No credit card required</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-navy-700/60 border-t border-white/8 py-7 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 100 100" className="w-7 h-7" aria-hidden="true">
              <path d="M 50 10 L 85 40 L 85 55 L 50 25 L 15 55 L 15 40 Z" fill="#FFFFFF" />
              <path d="M 50 35 L 85 65 L 85 80 L 50 50 L 15 80 L 15 65 Z" fill="#C8102E" />
            </svg>
            <span
              className="text-white font-bold text-sm uppercase tracking-widest"
              style={{ fontFamily: 'var(--font-condensed)' }}
            >
              Scene Ready
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link to="/login" search={{ from: '/orgs', verified: false, reset: false }} className="text-white/40 hover:text-white/70 transition-colors">Sign In</Link>
            <Link to="/register" className="text-white/40 hover:text-white/70 transition-colors">Register</Link>
          </div>
          <p className="text-white/20 text-xs">© 2026 Scene Ready. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
