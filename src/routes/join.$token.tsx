import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { getSessionServerFn } from '@/lib/auth'
import {
  getInvitationByTokenServerFn,
  acceptInvitationServerFn,
} from '@/server/staff'
import type { InvitationView } from '@/lib/staff.types'

export const Route = createFileRoute('/join/$token')({
  head: () => ({
    meta: [{ title: 'Join Organization | Scene Ready' }],
  }),
  loader: async ({ params }): Promise<LoaderData> => {
    const session = await getSessionServerFn()

    const result = await getInvitationByTokenServerFn({ data: { token: params.token } })

    if (!result.success) {
      return { state: 'error', error: result.error }
    }

    if (session && session.email === result.invitation.email) {
      const accept = await acceptInvitationServerFn({ data: { token: params.token } })
      if (accept.success) {
        throw redirect({ to: '/orgs/$orgSlug', params: { orgSlug: accept.orgSlug } })
      }
    }

    return {
      state: 'ready',
      invitation: result.invitation,
      isLoggedIn: !!session,
      loggedInEmail: session?.email ?? null,
    }
  },
  component: JoinPage,
})

type LoaderData =
  | { state: 'error'; error: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' }
  | { state: 'ready'; invitation: InvitationView; isLoggedIn: boolean; loggedInEmail: string | null }

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'This invitation link is invalid or does not exist.',
  EXPIRED: 'This invitation link has expired. Please ask an admin to resend it.',
  ALREADY_USED: 'This invitation link has already been used or was cancelled.',
}

function JoinPage() {
  const loaderData = Route.useLoaderData()
  const { token } = Route.useParams()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)

  if (loaderData.state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white border border-gray-200 rounded-xl shadow-md p-8 text-center">
            <h1 className="text-xl font-semibold text-navy-700 mb-3">Invitation unavailable</h1>
            <p className="text-gray-600 text-sm">
              {ERROR_MESSAGES[loaderData.error] ?? 'This invitation link is not valid.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { invitation, isLoggedIn, loggedInEmail } = loaderData

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) { setFormError('Name is required.'); return }
    if (password.length < 8) { setFormError('Password must be at least 8 characters.'); return }

    setBusy(true)
    try {
      const result = await acceptInvitationServerFn({
        data: { token, name: name.trim(), password },
      })
      if (result.success) {
        await navigate({ to: '/orgs/$orgSlug', params: { orgSlug: result.orgSlug } })
      } else if (result.error === 'LOGIN_REQUIRED') {
        setShowLoginPrompt(true)
      } else {
        const msgs: Record<string, string> = {
          VALIDATION_ERROR: 'Please check your name and password and try again.',
          ALREADY_USED: 'This invitation has already been accepted.',
          EXPIRED: 'This invitation has expired. Please ask an admin to resend it.',
        }
        setFormError(msgs[result.error] ?? 'An error occurred. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleLinkAccount(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const result = await acceptInvitationServerFn({ data: { token } })
      if (result.success) {
        await navigate({ to: '/orgs/$orgSlug', params: { orgSlug: result.orgSlug } })
      } else {
        setFormError('Failed to link your account. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-gray-200 rounded-xl shadow-md p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-navy-700">
              Join {invitation.orgName}
            </h1>
            {invitation.inviterName && (
              <p className="text-gray-600 text-sm mt-1">
                {invitation.inviterName} has invited you
              </p>
            )}
            <p className="text-gray-400 text-xs mt-2">
              Invitation for <span className="text-gray-600">{invitation.email}</span>
            </p>
          </div>

          {/* If logged in with wrong email, show mismatch warning */}
          {isLoggedIn && loggedInEmail && loggedInEmail !== invitation.email && (
            <div className="mb-5 p-3 rounded-lg bg-warning-bg border border-warning/30 text-warning text-sm">
              You are logged in as <strong>{loggedInEmail}</strong>, but this invitation is for{' '}
              <strong>{invitation.email}</strong>. Please log out and try again.
            </div>
          )}

          {/* If logged in with correct email — link account form */}
          {isLoggedIn && loggedInEmail === invitation.email && (
            <form onSubmit={handleLinkAccount}>
              <p className="text-gray-600 text-sm mb-4">
                Click below to accept the invitation and join{' '}
                <strong className="text-gray-900">{invitation.orgName}</strong> as{' '}
                <strong className="text-gray-900 capitalize">{invitation.role}</strong>.
              </p>
              {formError && <p className="text-danger text-sm mb-3">{formError}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md font-semibold transition-colors"
              >
                {busy ? 'Joining…' : 'Accept invitation'}
              </button>
            </form>
          )}

          {/* If not logged in — show login prompt or register form */}
          {!isLoggedIn && (
            showLoginPrompt ? (
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-4">
                  An account already exists with <strong className="text-gray-900">{invitation.email}</strong>.
                  Please{' '}
                  <a href="/login" className="text-red-700 hover:text-red-800">log in</a>
                  {' '}and then click the invitation link again to accept.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRegister}>
                <p className="text-gray-600 text-sm mb-5">
                  Create an account to join <strong className="text-gray-900">{invitation.orgName}</strong> as{' '}
                  <strong className="text-gray-900 capitalize">{invitation.role}</strong>.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={invitation.email}
                      readOnly
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-gray-500 text-sm cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Your name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                      autoFocus
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Password <span className="text-danger">*</span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
                    />
                  </div>
                </div>
                {formError && (
                  <p className="text-danger text-sm mt-3">{formError}</p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full mt-5 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md font-semibold transition-colors"
                >
                  {busy ? 'Creating account…' : 'Create account & join'}
                </button>
                <p className="text-center text-gray-400 text-xs mt-4">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setShowLoginPrompt(true)}
                    className="text-red-700 hover:text-red-800"
                  >
                    Log in instead
                  </button>
                </p>
              </form>
            )
          )}
        </div>
      </div>
    </div>
  )
}
