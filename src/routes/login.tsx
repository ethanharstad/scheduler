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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-6">Sign in</h1>

        {/* T026: verified=1 success banner */}
        {verified && (
          <div className="mb-4 p-3 bg-green-900/50 border border-green-500/50 rounded-lg text-green-400 text-sm">
            Email verified — you can now sign in.
          </div>
        )}

        {/* T027: reset=1 success banner */}
        {reset && (
          <div className="mb-4 p-3 bg-green-900/50 border border-green-500/50 rounded-lg text-green-400 text-sm">
            Password updated — please sign in.
          </div>
        )}

        {error === 'INVALID_CREDENTIALS' && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-sm">
            Invalid email or password.
          </div>
        )}

        {error === 'ACCOUNT_LOCKED' && lockedUntil && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-sm">
            Account temporarily locked — try again after{' '}
            {new Date(lockedUntil).toLocaleTimeString()}.
          </div>
        )}

        {error === 'EMAIL_UNVERIFIED' && (
          <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-500/50 rounded-lg text-yellow-400 text-sm">
            <p>Please verify your email before signing in.</p>
            {resendSent ? (
              <p className="mt-1 text-green-400">Verification email sent!</p>
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

          <div>
            <label
              htmlFor="password"
              className="block text-sm text-gray-400 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-400 space-y-2 text-center">
          <p>
            <a
              href="/forgot-password"
              className="text-cyan-400 hover:text-cyan-300"
            >
              Forgot password?
            </a>
          </p>
          <p>
            Don&apos;t have an account?{' '}
            <a href="/register" className="text-cyan-400 hover:text-cyan-300">
              Register
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
