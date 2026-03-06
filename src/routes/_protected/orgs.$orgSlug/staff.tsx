import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { UserPlus, Mail, Phone, Send, X, RefreshCw, Trash2, ChevronDown } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { OrgRole } from '@/lib/org.types'
import type { StaffMemberView } from '@/lib/staff.types'
import {
  listStaffServerFn,
  addStaffMemberServerFn,
  inviteStaffMemberServerFn,
  cancelInvitationServerFn,
  resendInvitationServerFn,
  changeStaffRoleServerFn,
  removeStaffMemberServerFn,
} from '@/server/staff'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/staff')({
  loader: async ({ params }) => {
    const result = await listStaffServerFn({ data: { orgSlug: params.orgSlug } })
    if (!result.success) return { members: [] }
    return { members: result.members }
  },
  component: StaffPage,
})

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  payroll_hr: 'Payroll / HR',
}

const ALL_ROLES: OrgRole[] = ['owner', 'admin', 'manager', 'employee', 'payroll_hr']
const ASSIGNABLE_ROLES: OrgRole[] = ['admin', 'manager', 'employee', 'payroll_hr']

function statusBadge(status: StaffMemberView['status']) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-success-bg text-success" style={{ fontFamily: 'var(--font-condensed)' }}>
        Active
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-warning-bg text-warning" style={{ fontFamily: 'var(--font-condensed)' }}>
        Invite Pending
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>
      No Account
    </span>
  )
}

function StaffPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { members: initialMembers } = Route.useLoaderData()

  const [members, setMembers] = useState<StaffMemberView[]>(initialMembers)
  const [showAddForm, setShowAddForm] = useState(false)

  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addRole, setAddRole] = useState<OrgRole>('employee')
  const [addError, setAddError] = useState<string | null>(null)
  const [addBusy, setAddBusy] = useState(false)

  const [busyMember, setBusyMember] = useState<string | null>(null)
  const [memberError, setMemberError] = useState<Record<string, string>>({})
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const canManage = canDo(userRole, 'invite-members')
  const canChangeRoles = canDo(userRole, 'assign-roles')
  const canRemove = canDo(userRole, 'remove-members')
  const canViewAudit = canDo(userRole, 'assign-roles')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    if (!addName.trim()) { setAddError('Name is required.'); return }
    if (!addEmail.trim() && !addPhone.trim()) { setAddError('At least one contact field (email or phone) is required.'); return }

    setAddBusy(true)
    try {
      const result = await addStaffMemberServerFn({
        data: {
          orgSlug: org.slug,
          name: addName.trim(),
          email: addEmail.trim() || undefined,
          phone: addPhone.trim() || undefined,
          role: addRole,
        },
      })
      if (result.success) {
        setMembers((prev) => [...prev, result.member].sort((a, b) => a.name.localeCompare(b.name)))
        setAddName(''); setAddEmail(''); setAddPhone(''); setAddRole('employee')
        setShowAddForm(false)
      } else {
        const msgs: Record<string, string> = {
          CONTACT_REQUIRED: 'At least one contact field (email or phone) is required.',
          DUPLICATE_EMAIL: 'A staff member with this email already exists.',
          FORBIDDEN: 'You do not have permission to add staff members.',
          VALIDATION_ERROR: 'Please check the form fields and try again.',
        }
        setAddError(msgs[result.error] ?? 'An error occurred. Please try again.')
      }
    } finally {
      setAddBusy(false)
    }
  }

  async function handleInvite(memberId: string) {
    setBusyMember(memberId)
    setMemberError((prev) => ({ ...prev, [memberId]: '' }))
    try {
      const result = await inviteStaffMemberServerFn({ data: { orgSlug: org.slug, staffMemberId: memberId } })
      if (result.success) {
        setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, status: 'pending' } : m))
      } else {
        const msgs: Record<string, string> = {
          NO_EMAIL: 'This member has no email address. Add one before inviting.',
          ALREADY_ACTIVE: 'This member already has an active account.',
          ALREADY_PENDING: 'An invitation is already pending for this member.',
          FORBIDDEN: 'You do not have permission to send invitations.',
        }
        setMemberError((prev) => ({ ...prev, [memberId]: msgs[result.error] ?? 'Failed to send invitation.' }))
      }
    } finally {
      setBusyMember(null)
    }
  }

  async function handleCancelInvite(memberId: string) {
    setBusyMember(memberId)
    setMemberError((prev) => ({ ...prev, [memberId]: '' }))
    try {
      const result = await cancelInvitationServerFn({ data: { orgSlug: org.slug, staffMemberId: memberId } })
      if (result.success) {
        setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, status: 'roster_only' } : m))
      } else {
        setMemberError((prev) => ({ ...prev, [memberId]: 'Failed to cancel invitation.' }))
      }
    } finally {
      setBusyMember(null)
    }
  }

  async function handleResendInvite(memberId: string) {
    setBusyMember(memberId)
    setMemberError((prev) => ({ ...prev, [memberId]: '' }))
    try {
      const result = await resendInvitationServerFn({ data: { orgSlug: org.slug, staffMemberId: memberId } })
      if (!result.success) {
        setMemberError((prev) => ({ ...prev, [memberId]: 'Failed to resend invitation.' }))
      }
    } finally {
      setBusyMember(null)
    }
  }

  async function handleRoleChange(memberId: string, newRole: OrgRole) {
    setBusyMember(memberId)
    setMemberError((prev) => ({ ...prev, [memberId]: '' }))
    try {
      const result = await changeStaffRoleServerFn({ data: { orgSlug: org.slug, staffMemberId: memberId, newRole } })
      if (result.success) {
        setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m))
      } else {
        const msgs: Record<string, string> = {
          OWNER_TRANSFER_REQUIRED: 'Transfer ownership first before changing the owner\'s role.',
          FORBIDDEN: 'You do not have permission to change roles.',
          INVALID_ROLE: 'Invalid role selected.',
        }
        setMemberError((prev) => ({ ...prev, [memberId]: msgs[result.error] ?? 'Failed to change role.' }))
      }
    } finally {
      setBusyMember(null)
    }
  }

  async function handleRemove(memberId: string) {
    setBusyMember(memberId)
    setMemberError((prev) => ({ ...prev, [memberId]: '' }))
    try {
      const result = await removeStaffMemberServerFn({ data: { orgSlug: org.slug, staffMemberId: memberId } })
      if (result.success) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId))
        setConfirmRemove(null)
      } else {
        const msgs: Record<string, string> = {
          LAST_OWNER: 'Cannot remove the last owner. Transfer ownership first.',
          FORBIDDEN: 'You do not have permission to remove members.',
        }
        setMemberError((prev) => ({ ...prev, [memberId]: msgs[result.error] ?? 'Failed to remove member.' }))
        setConfirmRemove(null)
      }
    } finally {
      setBusyMember(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Staff</h1>
          <p className="text-sm text-gray-500 mt-1">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {canViewAudit && (
            <Link
              to="/orgs/$orgSlug/staff/audit"
              params={{ orgSlug: org.slug }}
              className="text-sm text-gray-500 hover:text-navy-700 transition-colors"
            >
              View audit log
            </Link>
          )}
          {canManage && (
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add staff member
            </button>
          )}
        </div>
      </div>

      {/* Add Staff Form */}
      {showAddForm && canManage && (
        <form
          onSubmit={handleAdd}
          className="mb-6 p-5 rounded-lg border border-gray-200 bg-white"
        >
          <h2 className="text-base font-semibold text-navy-700 mb-4">New staff member</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Role</label>
              <div className="relative">
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as OrgRole)}
                  className="w-full appearance-none px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-navy-500"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Email <span className="text-gray-400">(or phone required)</span>
              </label>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-navy-500"
              />
            </div>
          </div>
          {addError && (
            <p className="mt-3 text-sm text-danger">{addError}</p>
          )}
          <div className="flex items-center gap-3 mt-4">
            <button
              type="submit"
              disabled={addBusy}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors"
            >
              {addBusy ? 'Adding…' : 'Add member'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddError(null) }}
              className="px-4 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Staff Table */}
      {members.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium text-gray-500">No staff members yet.</p>
          {canManage && (
            <p className="text-sm mt-1">Click "Add staff member" to get started.</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
                {(canManage || canChangeRoles || canRemove) && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const busy = busyMember === member.id
                const error = memberError[member.id]
                const confirming = confirmRemove === member.id

                return (
                  <tr key={member.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{member.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {member.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          {member.email}
                        </span>
                      )}
                      {member.phone && (
                        <span className="flex items-center gap-1 mt-0.5">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          {member.phone}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canChangeRoles && member.role !== 'owner' ? (
                        <div className="relative inline-block">
                          <select
                            value={member.role}
                            disabled={busy}
                            onChange={(e) => handleRoleChange(member.id, e.target.value as OrgRole)}
                            className="appearance-none pr-6 pl-2 py-1 bg-white border border-gray-300 rounded-md text-gray-700 text-xs focus:outline-none focus:border-navy-500 disabled:opacity-50"
                          >
                            {ALL_ROLES.filter((r) => r !== 'owner').map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-1 top-1.5 w-3 h-3 text-gray-400 pointer-events-none" />
                        </div>
                      ) : (
                        <span className="text-gray-700">{ROLE_LABELS[member.role]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(member.status)}</td>
                    {(canManage || canChangeRoles || canRemove) && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {canManage && member.status === 'roster_only' && (
                            <button
                              onClick={() => handleInvite(member.id)}
                              disabled={busy || !member.email}
                              title={!member.email ? 'Add an email address first' : 'Send invitation'}
                              className="flex items-center gap-1 px-2.5 py-1 bg-info-bg hover:bg-info/10 disabled:opacity-40 disabled:cursor-not-allowed text-info rounded-md text-xs transition-colors"
                            >
                              <Send className="w-3 h-3" />
                              {busy ? 'Sending…' : 'Invite'}
                            </button>
                          )}
                          {canManage && member.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleResendInvite(member.id)}
                                disabled={busy}
                                className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 rounded-md text-xs transition-colors"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Resend
                              </button>
                              <button
                                onClick={() => handleCancelInvite(member.id)}
                                disabled={busy}
                                className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 rounded-md text-xs transition-colors"
                              >
                                <X className="w-3 h-3" />
                                Cancel
                              </button>
                            </>
                          )}

                          {canRemove && (
                            confirming ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500">Remove?</span>
                                <button
                                  onClick={() => handleRemove(member.id)}
                                  disabled={busy}
                                  className="px-2 py-1 bg-danger hover:opacity-90 disabled:opacity-50 text-white rounded-md text-xs"
                                >
                                  {busy ? '…' : 'Yes'}
                                </button>
                                <button
                                  onClick={() => setConfirmRemove(null)}
                                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-xs"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  if (member.role === 'owner') {
                                    setMemberError((prev) => ({
                                      ...prev,
                                      [member.id]: 'Transfer ownership first before removing this member.',
                                    }))
                                    return
                                  }
                                  setConfirmRemove(member.id)
                                }}
                                disabled={busy}
                                title={member.role === 'owner' ? 'Transfer ownership first' : 'Remove member'}
                                className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-danger-bg disabled:opacity-50 text-gray-500 hover:text-danger rounded-md text-xs transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remove
                              </button>
                            )
                          )}
                        </div>

                        {error && (
                          <p className="text-xs text-danger mt-1 text-right">{error}</p>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
