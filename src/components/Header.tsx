import { Link } from '@tanstack/react-router'

import { useState } from 'react'
import { Calendar, X, Menu, Award, RefreshCw, Clock, DollarSign } from 'lucide-react'

const NAV_LINKS = [
  { label: 'Scheduling', href: '/#scheduling', icon: <Calendar size={18} /> },
  { label: 'Qualifications', href: '/#qualifications', icon: <Award size={18} /> },
  { label: 'Shift Trading', href: '/#trading', icon: <RefreshCw size={18} /> },
  { label: 'Leave Management', href: '/#leave', icon: <Clock size={18} /> },
  { label: 'Payroll', href: '/#payroll', icon: <DollarSign size={18} /> },
]

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-navy-700 border-b border-white/10 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors md:hidden"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-xl font-bold">
            <Link to="/" className="text-white hover:text-white/80 transition-colors">
              Scene Ready
            </Link>
          </h1>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="hidden md:flex items-center">
          <Link
            to="/login"
            className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Mobile drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-navy-700 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <span className="text-xl font-bold">Scene Ready</span>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors mb-1 text-white/70 hover:text-white"
            >
              {link.icon}
              <span className="font-medium">{link.label}</span>
            </a>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <Link
            to="/login"
            onClick={() => setIsOpen(false)}
            className="block w-full text-center px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-lg transition-colors"
          >
            Sign In
          </Link>
        </div>
      </aside>
    </>
  )
}
