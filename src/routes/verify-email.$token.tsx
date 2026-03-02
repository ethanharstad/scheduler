import { useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { verifyEmailServerFn, resendVerificationServerFn } from '@/server/auth'

export const Route = createFileRoute('/verify-email/$token')({
  loader: async ({ params }) => {
    return await verifyEmailServerFn({ data: { token: params.token } })
  },
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const result = Route.useLoaderData()
  const navigate = useNavigate()

  const [resendEmail, setResendEmail] = useState('')
  const [resendStatus, setResendStatus] = useState<
    'idle' | 'sending' | 'sent' | 'cooldown' | 'verified'
  >('idle')
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  if (result.success) {
    // Redirect to login with verified banner
    void navigate({
      to: '/login',
      search: { from: '/home', verified: true, reset: false },
    })
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <p className="text-green-400">Email verified! Redirecting…</p>
      </div>
    )
  }

  const isAlreadyUsed = result.error === 'ALREADY_USED'

  async function handleResend(e: FormEvent) {
    e.preventDefault()
    setResendStatus('sending')
    try {
      const resendResult = await resendVerificationServerFn({
        data: { email: resendEmail },
      })
      if (resendResult.success) {
        setResendStatus('sent')
      } else if (resendResult.error === 'COOLDOWN') {
        setResendStatus('cooldown')
        setCooldownSeconds(resendResult.retryAfter ?? 60)
      } else if (resendResult.error === 'ALREADY_VERIFIED') {
        setResendStatus('verified')
      } else {
        setResendStatus('idle')
      }
    } catch {
      setResendStatus('idle')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-4">
          {isAlreadyUsed ? 'Already verified' : 'Verification link expired'}
        </h1>

        {isAlreadyUsed ? (
          <p className="text-gray-400 mb-6">
            Your email is already verified.{' '}
            <a href="/login" className="text-cyan-400 hover:text-cyan-300">
              Sign in
            </a>
          </p>
        ) : (
          <>
            <p className="text-gray-400 mb-6">
              This verification link is invalid or has expired. Enter your email
              to receive a new one.
            </p>

            {resendStatus === 'sent' && (
              <p className="mb-4 text-green-400 text-sm">
                Verification email sent! Check your inbox.
              </p>
            )}
            {resendStatus === 'cooldown' && (
              <p className="mb-4 text-yellow-400 text-sm">
                Please wait {cooldownSeconds}s before requesting another email.
              </p>
            )}
            {resendStatus === 'verified' && (
              <p className="mb-4 text-green-400 text-sm">
                Your email is already verified.{' '}
                <a href="/login" className="underline">
                  Sign in
                </a>
              </p>
            )}

            {resendStatus === 'idle' || resendStatus === 'sending' ? (
              <form onSubmit={(e) => void handleResend(e)} className="space-y-4">
                <div>
                  <label
                    htmlFor="resend-email"
                    className="block text-sm text-gray-400 mb-1"
                  >
                    Email address
                  </label>
                  <input
                    id="resend-email"
                    type="email"
                    required
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resendStatus === 'sending'}
                  className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                >
                  {resendStatus === 'sending'
                    ? 'Sending…'
                    : 'Send new verification email'}
                </button>
              </form>
            ) : null}
          </>
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
