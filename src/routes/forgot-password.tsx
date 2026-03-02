import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionServerFn } from '@/lib/auth'
import { forgotPasswordServerFn } from '@/server/auth'

export const Route = createFileRoute('/forgot-password')({
  beforeLoad: async () => {
    const session = await getSessionServerFn()
    if (session) throw redirect({ to: '/home' })
  },
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCooldownNote, setShowCooldownNote] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email) return

    if (submitted) {
      // Second submission — note the cooldown
      setShowCooldownNote(true)
    }

    setIsSubmitting(true)
    try {
      await forgotPasswordServerFn({ data: { email } })
      setSubmitted(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-2">Reset password</h1>
        <p className="text-gray-400 text-sm mb-6">
          Enter your email and we'll send you a reset link.
        </p>

        {submitted && (
          <div className="mb-4 p-3 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 text-sm">
            If that email is registered, you'll receive a reset link shortly.
            {showCooldownNote && (
              <p className="mt-1 text-gray-400">
                Note: reset links can only be requested once per minute.
              </p>
            )}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-gray-400 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
          >
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-6 text-sm text-gray-400 text-center">
          <a href="/login" className="text-cyan-400 hover:text-cyan-300">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  )
}
