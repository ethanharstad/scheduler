import { useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { verifyEmailServerFn, resendVerificationServerFn } from '@/server/auth'

export const Route = createFileRoute('/verify-email/$token')({
  head: () => ({
    meta: [{ title: 'Verify Email | Scene Ready' }],
  }),
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
    void navigate({
      to: '/login',
      search: { from: '/home', verified: true, reset: false },
    })
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-success">Email verified! Redirecting…</p>
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-navy-700 mb-4">
            {isAlreadyUsed ? 'Already verified' : 'Verification link expired'}
          </h1>

          {isAlreadyUsed ? (
            <p className="text-gray-600 mb-6">
              Your email is already verified.{' '}
              <a href="/login" className="text-red-700 hover:text-red-800">
                Sign in
              </a>
            </p>
          ) : (
            <>
              <p className="text-gray-600 mb-6">
                This verification link is invalid or has expired. Enter your email
                to receive a new one.
              </p>

              {resendStatus === 'sent' && (
                <p className="mb-4 text-success text-sm">
                  Verification email sent! Check your inbox.
                </p>
              )}
              {resendStatus === 'cooldown' && (
                <p className="mb-4 text-warning text-sm">
                  Please wait {cooldownSeconds}s before requesting another email.
                </p>
              )}
              {resendStatus === 'verified' && (
                <p className="mb-4 text-success text-sm">
                  Your email is already verified.{' '}
                  <a href="/login" className="underline">
                    Sign in
                  </a>
                </p>
              )}

              {resendStatus === 'idle' || resendStatus === 'sending' ? (
                <form onSubmit={(e) => void handleResend(e)} className="space-y-4">
                  <div>
                    <label htmlFor="resend-email" className="block text-sm font-medium text-gray-600 mb-1">
                      Email address
                    </label>
                    <input
                      id="resend-email"
                      type="email"
                      required
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
                      placeholder="you@example.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resendStatus === 'sending'}
                    className="w-full py-2 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold rounded-md transition-colors"
                  >
                    {resendStatus === 'sending'
                      ? 'Sending…'
                      : 'Send new verification email'}
                  </button>
                </form>
              ) : null}
            </>
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
