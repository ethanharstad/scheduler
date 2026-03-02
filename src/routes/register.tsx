import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionServerFn } from '@/lib/auth'
import { registerServerFn, resendVerificationServerFn } from '@/server/auth'

export const Route = createFileRoute('/register')({
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Check your inbox</h1>
          <p className="text-gray-400 mb-6">
            We sent a verification link to <strong className="text-white">{email}</strong>.
            Click the link to activate your account.
          </p>
          {resendStatus === 'sent' ? (
            <p className="text-green-400 text-sm">Verification email resent!</p>
          ) : resendStatus === 'cooldown' ? (
            <p className="text-yellow-400 text-sm">
              Please wait {cooldownSeconds}s before requesting another email.
            </p>
          ) : (
            <button
              onClick={() => void handleResend()}
              disabled={resendStatus === 'sending'}
              className="text-cyan-400 hover:text-cyan-300 text-sm underline hover:no-underline disabled:opacity-50"
            >
              {resendStatus === 'sending' ? 'Sending…' : "Didn't receive it? Resend"}
            </button>
          )}
          <p className="mt-6 text-sm text-gray-400">
            Already verified?{' '}
            <a href="/login" className="text-cyan-400 hover:text-cyan-300">
              Sign in
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-6">Create account</h1>

        {serverError && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {serverError}
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
              className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 ${
                fieldErrors.email ? 'border-red-500' : 'border-slate-700'
              }`}
              placeholder="you@example.com"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-red-400 text-xs">{fieldErrors.email}</p>
            )}
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 ${
                fieldErrors.password ? 'border-red-500' : 'border-slate-700'
              }`}
              placeholder="••••••••"
            />
            {password && (
              <ul className="mt-2 space-y-1 text-xs">
                <li className={strength.length ? 'text-green-400' : 'text-gray-500'}>
                  {strength.length ? '✓' : '○'} 8+ characters
                </li>
                <li className={strength.letter ? 'text-green-400' : 'text-gray-500'}>
                  {strength.letter ? '✓' : '○'} At least one letter
                </li>
                <li className={strength.digit ? 'text-green-400' : 'text-gray-500'}>
                  {strength.digit ? '✓' : '○'} At least one number
                </li>
              </ul>
            )}
            {fieldErrors.password && (
              <p className="mt-1 text-red-400 text-xs">{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-gray-400 text-center">
          Already have an account?{' '}
          <a href="/login" className="text-cyan-400 hover:text-cyan-300">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
