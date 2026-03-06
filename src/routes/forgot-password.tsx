import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionServerFn } from '@/lib/auth'
import { forgotPasswordServerFn } from '@/server/auth'

export const Route = createFileRoute('/forgot-password')({
  head: () => ({
    meta: [{ title: 'Forgot Password | Scene Ready' }],
  }),
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-navy-700 mb-2">Reset password</h1>
          <p className="text-gray-600 text-sm mb-6">
            Enter your email and we'll send you a reset link.
          </p>

          {submitted && (
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
              If that email is registered, you'll receive a reset link shortly.
              {showCooldownNote && (
                <p className="mt-1 text-gray-500">
                  Note: reset links can only be requested once per minute.
                </p>
              )}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold rounded-md transition-colors"
            >
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="mt-6 text-sm text-gray-600 text-center">
            <a href="/login" className="text-red-700 hover:text-red-800">
              Back to sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
