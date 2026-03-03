import { createFileRoute, redirect, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import type { OrgRole } from '@/lib/org.types'
import { canDo } from '@/lib/rbac'
import type { OrgMemberView } from '@/lib/rbac.types'
import {
  changeMemberRoleServerFn,
  listMembersServerFn,
  removeMemberServerFn,
  transferOwnershipServerFn,
} from '@/server/members'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/members')({
  beforeLoad: ({ context, params }) => {
    const { userRole } = context as { userRole: OrgRole }
    if (!canDo(userRole, 'assign-roles')) {
      throw redirect({
        to: '/orgs/$orgSlug',
        params: { orgSlug: params.orgSlug },
      })
    }
  },
  loader: async ({ params }) => {
    const result = await listMembersServerFn({ data: { orgSlug: params.orgSlug } })
    return {
      members: result.success ? result.members : [],
      orgSlug: params.orgSlug,
    }
  },
  component: MembersPage,
})

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  payroll_hr: 'Payroll / HR',
}

const ROLE_BADGE_COLORS: Record<OrgRole, string> = {
  owner: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  admin: 'bg-slate-500/20 text-slate-300 border border-slate-500/40',
  manager: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
  employee: 'bg-green-500/20 text-green-300 border border-green-500/40',
  payroll_hr: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
}

const ASSIGNABLE_ROLES: OrgRole[] = ['admin', 'manager', 'employee', 'payroll_hr']

const ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You don't have permission to do this.",
  LAST_OWNER: 'Cannot remove the last owner — transfer ownership first.',
  INVALID_ROLE: 'Use the Transfer Ownership action to assign the Owner role.',
  NOT_FOUND: 'Member not found.',
  SELF_TRANSFER: 'You cannot transfer ownership to yourself.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
}

function MembersPage() {
  const { userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { members: initialMembers, orgSlug } = Route.useLoaderData()
  const [members, setMembers] = useState<OrgMemberView[]>(initialMembers)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmTransfer, setConfirmTransfer] = useState<string | null>(null)

  async function handleRoleChange(memberId: string, newRole: OrgRole) {
    setBusy((b) => ({ ...b, [memberId]: true }))
    setErrors((e) => ({ ...e, [memberId]: '' }))
    const result = await changeMemberRoleServerFn({ data: { orgSlug, memberId, newRole } })
    setBusy((b) => ({ ...b, [memberId]: false }))
    if (result.success) {
      setMembers((prev) =>
        prev.map((m) => (m.memberId === memberId ? { ...m, role: newRole } : m)),
      )
    } else {
      setErrors((e) => ({ ...e, [memberId]: ERROR_MESSAGES[result.error] ?? result.error }))
    }
  }

  async function handleRemove(memberId: string) {
    setBusy((b) => ({ ...b, [memberId]: true }))
    setErrors((e) => ({ ...e, [memberId]: '' }))
    const result = await removeMemberServerFn({ data: { orgSlug, memberId } })
    setBusy((b) => ({ ...b, [memberId]: false }))
    setConfirmRemove(null)
    if (result.success) {
      setMembers((prev) => prev.filter((m) => m.memberId !== memberId))
    } else {
      setErrors((e) => ({ ...e, [memberId]: ERROR_MESSAGES[result.error] ?? result.error }))
    }
  }

  async function handleTransferOwnership(newOwnerMemberId: string) {
    setBusy((b) => ({ ...b, [newOwnerMemberId]: true }))
    setErrors((e) => ({ ...e, [newOwnerMemberId]: '' }))
    const result = await transferOwnershipServerFn({ data: { orgSlug, newOwnerMemberId } })
    setBusy((b) => ({ ...b, [newOwnerMemberId]: false }))
    setConfirmTransfer(null)
    if (result.success) {
      const reloaded = await listMembersServerFn({ data: { orgSlug } })
      if (reloaded.success) setMembers(reloaded.members)
    } else {
      setErrors((e) => ({
        ...e,
        [newOwnerMemberId]: ERROR_MESSAGES[result.error] ?? result.error,
      }))
    }
  }

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Members</h1>

      {members.length === 0 ? (
        <p className="text-gray-400">No active members found.</p>
      ) : (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Member</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Role</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Joined</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isBusy = busy[member.memberId] ?? false
                const error = errors[member.memberId]
                const isOwner = member.role === 'owner'

                return (
                  <tr
                    key={member.memberId}
                    className="border-b border-slate-700/50 last:border-0 hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{member.displayName}</div>
                      <div className="text-gray-500 text-xs">{member.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_COLORS.owner}`}
                        >
                          {ROLE_LABELS.owner}
                        </span>
                      ) : (
                        <select
                          value={member.role}
                          disabled={isBusy}
                          onChange={(e) =>
                            void handleRoleChange(member.memberId, e.target.value as OrgRole)
                          }
                          className="bg-slate-700 text-gray-200 text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      )}
                      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(member.joinedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {userRole === 'owner' && !isOwner && (
                          <>
                            {confirmTransfer === member.memberId ? (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-amber-300">Transfer to {member.displayName}?</span>
                                <button
                                  onClick={() => void handleTransferOwnership(member.memberId)}
                                  disabled={isBusy}
                                  className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmTransfer(null)}
                                  className="px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmTransfer(member.memberId)}
                                disabled={isBusy}
                                className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50"
                              >
                                Transfer Ownership
                              </button>
                            )}
                          </>
                        )}
                        {!isOwner && (
                          <>
                            {confirmRemove === member.memberId ? (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-red-300">Remove?</span>
                                <button
                                  onClick={() => void handleRemove(member.memberId)}
                                  disabled={isBusy}
                                  className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white disabled:opacity-50"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmRemove(null)}
                                  className="px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRemove(member.memberId)}
                                disabled={isBusy}
                                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
