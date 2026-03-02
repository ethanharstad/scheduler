import { useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { resetPasswordServerFn } from '@/server/auth'

export const Route = createFileRoute('/reset-password/$token')({
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-6">Set new password</h1>

        {isTokenError && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-sm">
            <p>
              {error === 'EXPIRED_TOKEN'
                ? 'This reset link has expired.'
                : 'This reset link is invalid or has already been used.'}
            </p>
            <p className="mt-1">
              <a
                href="/forgot-password"
                className="underline hover:no-underline"
              >
                Request a new reset link
              </a>
            </p>
          </div>
        )}

        {!isTokenError && (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm text-gray-400 mb-1"
              >
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 ${
                  error === 'INVALID_INPUT'
                    ? 'border-red-500'
                    : 'border-slate-700'
                }`}
                placeholder="••••••••"
              />

              {password && (
                <ul className="mt-2 space-y-1 text-xs">
                  <li
                    className={
                      strength.length ? 'text-green-400' : 'text-gray-500'
                    }
                  >
                    {strength.length ? '✓' : '○'} 8+ characters
                  </li>
                  <li
                    className={
                      strength.letter ? 'text-green-400' : 'text-gray-500'
                    }
                  >
                    {strength.letter ? '✓' : '○'} At least one letter
                  </li>
                  <li
                    className={
                      strength.digit ? 'text-green-400' : 'text-gray-500'
                    }
                  >
                    {strength.digit ? '✓' : '○'} At least one number
                  </li>
                </ul>
              )}

              {error === 'INVALID_INPUT' && (
                <p className="mt-1 text-red-400 text-xs">
                  Password must be 8+ characters with at least one letter and
                  one number.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
            >
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-gray-400 text-center">
          <a href="/login" className="text-cyan-400 hover:text-cyan-300">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  )
}
