import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionServerFn } from '@/lib/auth'
import { registerServerFn, resendVerificationServerFn } from '@/server/auth'

export const Route = createFileRoute('/register')({
  head: () => ({
    meta: [{ title: 'Create Account | Scene Ready' }],
  }),
  beforeLoad: async () => {
    const session = await getSessionServerFn()
    if (session) throw redirect({ to: '/home' })
  },
  component: RegisterPage,
})

function passwordMeetsRequirements(password: string) {
  return {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    digit: /[0-9]/.test(password),
  }
}

function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
    password?: string
  }>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [resendStatus, setResendStatus] = useState<
    'idle' | 'sending' | 'sent' | 'cooldown'
  >('idle')
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  const strength = passwordMeetsRequirements(password)
  const passwordValid = strength.length && strength.letter && strength.digit

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setServerError(null)

    const errors: typeof fieldErrors = {}
    if (!email) errors.email = 'Email is required'
    if (!passwordValid)
      errors.password = '8+ characters, at least one letter and one number'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await registerServerFn({ data: { email, password } })
      if (result.success) {
        setRegistered(true)
      } else if (result.error === 'EMAIL_TAKEN') {
        setFieldErrors({ email: 'An account with this email already exists.' })
      } else if (result.field === 'email') {
        setFieldErrors({ email: 'Please enter a valid email address.' })
      } else if (result.field === 'password') {
        setFieldErrors({
          password: '8+ characters, at least one letter and one number',
        })
      } else {
        setServerError('Something went wrong. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    setResendStatus('sending')
    try {
      const result = await resendVerificationServerFn({ data: { email } })
      if (result.success) {
        setResendStatus('sent')
      } else if (result.error === 'COOLDOWN') {
        setResendStatus('cooldown')
        setCooldownSeconds(result.retryAfter ?? 60)
      } else {
        setResendStatus('idle')
      }
    } catch {
      setResendStatus('idle')
    }
  }

  if (registered) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-gray-200 rounded-xl shadow-md p-8 text-center">
            <h1 className="text-2xl font-bold text-navy-700 mb-4">Check your inbox</h1>
            <p className="text-gray-600 mb-6">
              We sent a verification link to <strong className="text-gray-900">{email}</strong>.
              Click the link to activate your account.
            </p>
            {resendStatus === 'sent' ? (
              <p className="text-success text-sm">Verification email resent!</p>
            ) : resendStatus === 'cooldown' ? (
              <p className="text-warning text-sm">
                Please wait {cooldownSeconds}s before requesting another email.
              </p>
            ) : (
              <button
                onClick={() => void handleResend()}
                disabled={resendStatus === 'sending'}
                className="text-red-700 hover:text-red-800 text-sm underline hover:no-underline disabled:opacity-50"
              >
                {resendStatus === 'sending' ? 'Sending…' : "Didn't receive it? Resend"}
              </button>
            )}
            <p className="mt-6 text-sm text-gray-600">
              Already verified?{' '}
              <a href="/login" className="text-red-700 hover:text-red-800">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-navy-700 mb-6">Create account</h1>

          {serverError && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger/30 rounded-lg text-danger text-sm">
              {serverError}
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
                className={`w-full px-3 py-2 bg-white border rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15 ${
                  fieldErrors.email ? 'border-danger' : 'border-gray-300'
                }`}
                placeholder="you@example.com"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-danger text-xs">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-3 py-2 bg-white border rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15 ${
                  fieldErrors.password ? 'border-danger' : 'border-gray-300'
                }`}
                placeholder="••••••••"
              />
              {password && (
                <ul className="mt-2 space-y-1 text-xs">
                  <li className={strength.length ? 'text-success' : 'text-gray-400'}>
                    {strength.length ? '✓' : '○'} 8+ characters
                  </li>
                  <li className={strength.letter ? 'text-success' : 'text-gray-400'}>
                    {strength.letter ? '✓' : '○'} At least one letter
                  </li>
                  <li className={strength.digit ? 'text-success' : 'text-gray-400'}>
                    {strength.digit ? '✓' : '○'} At least one number
                  </li>
                </ul>
              )}
              {fieldErrors.password && (
                <p className="mt-1 text-danger text-xs">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold rounded-md transition-colors"
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-sm text-gray-600 text-center">
            Already have an account?{' '}
            <a href="/login" className="text-red-700 hover:text-red-800">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
