import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Calendar, X, Menu, Award, RefreshCw, Clock, DollarSign, ArrowRight } from 'lucide-react'

const NAV_LINKS = [
  { label: 'Scheduling', href: '/#scheduling', icon: <Calendar size={16} /> },
  { label: 'Qualifications', href: '/#qualifications', icon: <Award size={16} /> },
  { label: 'Shift Trading', href: '/#trading', icon: <RefreshCw size={16} /> },
  { label: 'Leave', href: '/#leave', icon: <Clock size={16} /> },
  { label: 'Payroll', href: '/#payroll', icon: <DollarSign size={16} /> },
]

function ChevronMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M 50 10 L 85 40 L 85 55 L 50 25 L 15 55 L 15 40 Z" fill="#FFFFFF" />
      <path d="M 50 35 L 85 65 L 85 80 L 50 50 L 15 80 L 15 65 Z" fill="#C8102E" />
    </svg>
  )
}

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between px-5 py-0 h-16 bg-navy-900/95 backdrop-blur border-b border-white/8 text-white">
        {/* Logo */}
        <div className="flex items-center gap-5">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors md:hidden"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-85 transition-opacity">
            <ChevronMark className="w-7 h-7" />
            <span
              className="text-white font-bold tracking-wide text-base hidden sm:block"
              style={{ fontFamily: 'var(--font-condensed)', fontWeight: 700, letterSpacing: '0.04em', fontSize: '1.05rem', textTransform: 'uppercase' }}
            >
              Scene Ready
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 ml-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 text-sm text-white/55 hover:text-white/90 hover:bg-white/8 rounded-md transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            to="/login"
            search={{ from: '/orgs', verified: false, reset: false }}
            className="px-4 py-1.5 text-sm text-white/65 hover:text-white transition-colors font-medium"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-md transition-colors shadow-lg shadow-red-700/25"
          >
            Get Started
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-navy-900 border-r border-white/10 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <ChevronMark className="w-6 h-6" />
            <span className="font-bold text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)' }}>Scene Ready</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/8 transition-colors mb-0.5 text-white/60 hover:text-white"
            >
              {link.icon}
              <span className="text-sm font-medium">{link.label}</span>
            </a>
          ))}
        </nav>

        <div className="p-4 space-y-2 border-t border-white/10">
          <Link
            to="/login"
            search={{ from: '/orgs', verified: false, reset: false }}
            onClick={() => setIsOpen(false)}
            className="block w-full text-center px-4 py-2.5 border border-white/20 hover:border-white/40 text-white/70 hover:text-white text-sm font-medium rounded-md transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            onClick={() => setIsOpen(false)}
            className="flex items-center justify-center gap-1.5 w-full px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-md transition-colors"
          >
            Get Started Free
            <ArrowRight size={14} />
          </Link>
        </div>
      </aside>
    </>
  )
}
