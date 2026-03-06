import { useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { resetPasswordServerFn } from '@/server/auth'

export const Route = createFileRoute('/reset-password/$token')({
  head: () => ({
    meta: [{ title: 'Reset Password | Scene Ready' }],
  }),
  component: ResetPasswordPage,
})

function passwordMeetsRequirements(password: string) {
  return {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    digit: /[0-9]/.test(password),
  }
}

function ResetPasswordPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<
    'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'ALREADY_USED' | 'INVALID_INPUT' | null
  >(null)

  const strength = passwordMeetsRequirements(password)
  const passwordValid = strength.length && strength.letter && strength.digit

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!passwordValid) {
      setError('INVALID_INPUT')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await resetPasswordServerFn({ data: { token, password } })
      if (result.success) {
        await navigate({
          to: '/login',
          search: { from: '/home', verified: false, reset: true },
        })
      } else {
        setError(result.error)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isTokenError =
    error === 'INVALID_TOKEN' ||
    error === 'EXPIRED_TOKEN' ||
    error === 'ALREADY_USED'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-navy-700 mb-6">Set new password</h1>

          {isTokenError && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger/30 rounded-lg text-danger text-sm">
              <p>
                {error === 'EXPIRED_TOKEN'
                  ? 'This reset link has expired.'
                  : 'This reset link is invalid or has already been used.'}
              </p>
              <p className="mt-1">
                <a href="/forgot-password" className="underline hover:no-underline">
                  Request a new reset link
                </a>
              </p>
            </div>
          )}

          {!isTokenError && (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-1">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15 ${
                    error === 'INVALID_INPUT' ? 'border-danger' : 'border-gray-300'
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

                {error === 'INVALID_INPUT' && (
                  <p className="mt-1 text-danger text-xs">
                    Password must be 8+ characters with at least one letter and one number.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold rounded-md transition-colors"
              >
                {isSubmitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}

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
