import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { getSessionServerFn } from '@/lib/auth'
import {
  getInvitationByTokenServerFn,
  acceptInvitationServerFn,
} from '@/server/staff'
import type { InvitationView } from '@/lib/staff.types'

export const Route = createFileRoute('/join/$token')({
  loader: async ({ params }): Promise<LoaderData> => {
    // Check if caller is already logged in
    const session = await getSessionServerFn()

    const result = await getInvitationByTokenServerFn({ data: { token: params.token } })

    if (!result.success) {
      return { state: 'error', error: result.error }
    }

    // If logged in with matching email, auto-accept and redirect
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="p-8 rounded-2xl border border-slate-700 bg-slate-800/60">
            <h1 className="text-xl font-semibold text-white mb-3">Invitation unavailable</h1>
            <p className="text-slate-400 text-sm">
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="p-8 rounded-2xl border border-slate-700 bg-slate-800/60">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white">
              Join {invitation.orgName}
            </h1>
            {invitation.inviterName && (
              <p className="text-slate-400 text-sm mt-1">
                {invitation.inviterName} has invited you
              </p>
            )}
            <p className="text-slate-500 text-xs mt-2">
              Invitation for <span className="text-slate-300">{invitation.email}</span>
            </p>
          </div>

          {/* If logged in with wrong email, show mismatch warning */}
          {isLoggedIn && loggedInEmail && loggedInEmail !== invitation.email && (
            <div className="mb-5 p-3 rounded-lg bg-amber-900/30 border border-amber-700/50 text-amber-300 text-sm">
              You are logged in as <strong>{loggedInEmail}</strong>, but this invitation is for{' '}
              <strong>{invitation.email}</strong>. Please log out and try again.
            </div>
          )}

          {/* If logged in with correct email — link account form */}
          {isLoggedIn && loggedInEmail === invitation.email && (
            <form onSubmit={handleLinkAccount}>
              <p className="text-slate-300 text-sm mb-4">
                Click below to accept the invitation and join{' '}
                <strong className="text-white">{invitation.orgName}</strong> as{' '}
                <strong className="text-white capitalize">{invitation.role}</strong>.
              </p>
              {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {busy ? 'Joining…' : 'Accept invitation'}
              </button>
            </form>
          )}

          {/* If not logged in — show login prompt or register form */}
          {!isLoggedIn && (
            showLoginPrompt ? (
              <div className="text-center">
                <p className="text-slate-300 text-sm mb-4">
                  An account already exists with <strong className="text-white">{invitation.email}</strong>.
                  Please{' '}
                  <a href="/login" className="text-blue-400 hover:underline">log in</a>
                  {' '}and then click the invitation link again to accept.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRegister}>
                <p className="text-slate-400 text-sm mb-5">
                  Create an account to join <strong className="text-white">{invitation.orgName}</strong> as{' '}
                  <strong className="text-white capitalize">{invitation.role}</strong>.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={invitation.email}
                      readOnly
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-400 text-sm cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">
                      Your name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                      autoFocus
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">
                      Password <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                {formError && (
                  <p className="text-red-400 text-sm mt-3">{formError}</p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full mt-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {busy ? 'Creating account…' : 'Create account & join'}
                </button>
                <p className="text-center text-slate-500 text-xs mt-4">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setShowLoginPrompt(true)}
                    className="text-blue-400 hover:underline"
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
