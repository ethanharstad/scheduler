import { createFileRoute, Link } from '@tanstack/react-router'
import { Calendar, Award, RefreshCw, Clock, DollarSign, ChevronRight } from 'lucide-react'

export const Route = createFileRoute('/')({ component: LandingPage })

const FEATURES = [
  {
    id: 'scheduling',
    icon: <Calendar className="w-10 h-10 text-cyan-400" />,
    title: 'Scheduling Engine',
    description:
      'Build and manage complex shift schedules with rotations, recurring patterns, and calendar views. Ensure minimum staffing levels are always met across your stations and units.',
    highlights: ['Shift rotations & patterns', 'Multi-station calendar', 'Minimum staffing enforcement'],
  },
  {
    id: 'qualifications',
    icon: <Award className="w-10 h-10 text-cyan-400" />,
    title: 'Qualifications & Compliance',
    description:
      'Track certifications, licenses, and training for every member of your department. Automated expiry alerts keep your roster compliant and position-eligible at all times.',
    highlights: ['Cert & license tracking', 'Expiry alerts', 'Position eligibility rules'],
  },
  {
    id: 'trading',
    icon: <RefreshCw className="w-10 h-10 text-cyan-400" />,
    title: 'Shift Trading & Coverage',
    description:
      'Empower your staff to initiate and accept shift trades, pick up open shifts, and request coverage — all with manager approval workflows and automatic qualification checks.',
    highlights: ['Staff-initiated trades', 'Open shift marketplace', 'Manager approval workflow'],
  },
  {
    id: 'leave',
    icon: <Clock className="w-10 h-10 text-cyan-400" />,
    title: 'Leave & Time Management',
    description:
      'Manage every leave type your department uses — vacation, sick, Kelly days, comp time, and more. Built-in accrual tracking and a streamlined request/approval workflow.',
    highlights: ['Custom leave types', 'Accrual tracking', 'Request & approval workflow'],
  },
  {
    id: 'payroll',
    icon: <DollarSign className="w-10 h-10 text-cyan-400" />,
    title: 'Payroll Integration',
    description:
      'Accurate time tracking with clock-in/out tied directly to scheduled shifts. Generate pay period summaries and export to ADP, QuickBooks, or your existing payroll system.',
    highlights: ['Shift-linked time tracking', 'Pay period summaries', 'ADP & QuickBooks export'],
  },
]

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Hero */}
      <section className="relative py-24 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10" />
        <div className="relative max-w-4xl mx-auto">
          <h1 className="text-6xl md:text-7xl font-black text-white mb-6 [letter-spacing:-0.04em]">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Scene Ready
            </span>
          </h1>
          <p className="text-2xl md:text-3xl text-gray-300 mb-4 font-light">
            Workforce management built for emergency services
          </p>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
            Scheduling, qualifications, shift trading, leave management, and payroll — purpose-built for fire, EMS, and law enforcement.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="flex items-center gap-2 px-8 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/30"
            >
              Get Started
              <ChevronRight size={18} />
            </Link>
            <Link
              to="/login"
              className="px-8 py-3 border border-slate-600 hover:border-slate-400 text-gray-300 hover:text-white font-semibold rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Sections */}
      {FEATURES.map((feature, index) => (
        <section
          key={feature.id}
          id={feature.id}
          className={`py-20 px-6 ${index % 2 === 0 ? 'bg-slate-800/40' : ''}`}
        >
          <div
            className={`max-w-5xl mx-auto flex flex-col ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-12`}
          >
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-700/60 rounded-2xl mb-6">
                {feature.icon}
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">{feature.title}</h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-6">{feature.description}</p>
              <ul className="space-y-2">
                {feature.highlights.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-gray-300">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full">
              <div className="bg-slate-700/40 border border-slate-600 rounded-2xl p-8 h-48 flex items-center justify-center">
                <div className="text-center text-slate-500">
                  <div className="mb-2">{feature.icon}</div>
                  <span className="text-sm">Coming soon</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* CTA Footer */}
      <section className="py-20 px-6 text-center bg-gradient-to-t from-slate-900 to-transparent">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to get started?</h2>
          <p className="text-gray-400 mb-8">
            Join departments across fire, EMS, and law enforcement who rely on Scene Ready to keep their teams prepared and compliant.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/30"
          >
            Create your organization
            <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  )
}
