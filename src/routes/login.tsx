import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { getSessionServerFn } from '@/lib/auth'
import { loginServerFn, resendVerificationServerFn } from '@/server/auth'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === 'string' ? search.from : '/home',
    verified: search.verified === '1' || search.verified === true,
    reset: search.reset === '1' || search.reset === true,
  }),
  beforeLoad: async () => {
    const session = await getSessionServerFn()
    if (session) throw redirect({ to: '/home' })
  },
  component: LoginPage,
})

function LoginPage() {
  const { from, verified, reset } = Route.useSearch()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<
    'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'EMAIL_UNVERIFIED' | null
  >(null)
  const [lockedUntil, setLockedUntil] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [isResending, setIsResending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLockedUntil(null)
    setIsSubmitting(true)
    try {
      const result = await loginServerFn({ data: { email, password, from } })
      if (result.success) {
        await navigate({ to: result.redirectTo })
      } else if (result.error === 'ACCOUNT_LOCKED') {
        setError('ACCOUNT_LOCKED')
        setLockedUntil(result.lockedUntil ?? null)
      } else {
        setError(result.error)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResendVerification() {
    if (!email) return
    setIsResending(true)
    try {
      await resendVerificationServerFn({ data: { email } })
      setResendSent(true)
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-navy-700 mb-6">Sign in</h1>

          {verified && (
            <div className="mb-4 p-3 bg-success-bg border border-success/30 rounded-lg text-success text-sm">
              Email verified — you can now sign in.
            </div>
          )}

          {reset && (
            <div className="mb-4 p-3 bg-success-bg border border-success/30 rounded-lg text-success text-sm">
              Password updated — please sign in.
            </div>
          )}

          {error === 'INVALID_CREDENTIALS' && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger/30 rounded-lg text-danger text-sm">
              Invalid email or password.
            </div>
          )}

          {error === 'ACCOUNT_LOCKED' && lockedUntil && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger/30 rounded-lg text-danger text-sm">
              Account temporarily locked — try again after{' '}
              {new Date(lockedUntil).toLocaleTimeString()}.
            </div>
          )}

          {error === 'EMAIL_UNVERIFIED' && (
            <div className="mb-4 p-3 bg-warning-bg border border-warning/30 rounded-lg text-warning text-sm">
              <p>Please verify your email before signing in.</p>
              {resendSent ? (
                <p className="mt-1 text-success">Verification email sent!</p>
              ) : (
                <button
                  onClick={() => void handleResendVerification()}
                  disabled={isResending || !email}
                  className="mt-1 underline hover:no-underline disabled:opacity-50"
                >
                  {isResending ? 'Sending…' : 'Resend verification email'}
                </button>
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold rounded-md transition-colors"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-sm text-gray-600 space-y-2 text-center">
            <p>
              <a href="/forgot-password" className="text-red-700 hover:text-red-800">
                Forgot password?
              </a>
            </p>
            <p>
              Don&apos;t have an account?{' '}
              <a href="/register" className="text-red-700 hover:text-red-800">
                Register
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
