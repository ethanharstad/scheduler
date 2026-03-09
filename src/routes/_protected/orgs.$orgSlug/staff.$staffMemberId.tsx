import { useState } from 'react'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { AlertTriangle, Star, Award, ChevronDown, X } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { StaffCertView, StaffMemberDetailView } from '@/lib/qualifications.types'
import {
  getStaffMemberDetailsServerFn,
  listRanksServerFn,
  listCertTypesServerFn,
  setStaffRankServerFn,
  upsertStaffCertServerFn,
  revokeStaffCertServerFn,
} from '@/server/qualifications'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/staff/$staffMemberId')({
  head: () => ({
    meta: [{ title: 'Staff Detail | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const [detailResult, ranksResult, certTypesResult] = await Promise.all([
      getStaffMemberDetailsServerFn({
        data: { orgSlug: params.orgSlug, staffMemberId: params.staffMemberId },
      }),
      listRanksServerFn({ data: { orgSlug: params.orgSlug } }),
      listCertTypesServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      staffMember: detailResult.success ? detailResult.staffMember : null,
      certs: detailResult.success ? detailResult.certs : [],
      ranks: ranksResult.success ? ranksResult.ranks : [],
      certTypes: certTypesResult.success ? certTypesResult.certTypes : [],
    }
  },
  component: StaffDetailPage,
})

const STATUS_LABELS: Record<string, string> = {
  roster_only: 'Roster Only',
  pending: 'Pending',
  active: 'Active',
  removed: 'Removed',
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  payroll_hr: 'Payroll / HR',
}

function certStatusBadge(status: StaffCertView['status'], isExpiringSoon: boolean) {
  if (status === 'revoked') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>
        Revoked
      </span>
    )
  }
  if (status === 'expired') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-danger-bg text-danger" style={{ fontFamily: 'var(--font-condensed)' }}>
        Expired
      </span>
    )
  }
  if (isExpiringSoon) {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-warning-bg text-warning" style={{ fontFamily: 'var(--font-condensed)' }}>
        <AlertTriangle className="w-3 h-3" /> Expiring Soon
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-success-bg text-success" style={{ fontFamily: 'var(--font-condensed)' }}>
      Active
    </span>
  )
}

function StaffDetailPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const loaderData = Route.useLoaderData()
  const params = Route.useParams()
  const canManage = canDo(userRole, 'manage-certifications')

  const [staffMember, setStaffMember] = useState<StaffMemberDetailView | null>(loaderData.staffMember)
  const [certs, setCerts] = useState<StaffCertView[]>(loaderData.certs)
  const { ranks, certTypes } = loaderData

  // Rank editing
  const [editingRank, setEditingRank] = useState(false)
  const [selectedRankId, setSelectedRankId] = useState(staffMember?.rankId ?? '')
  const [rankBusy, setRankBusy] = useState(false)

  // Cert form
  const [showCertForm, setShowCertForm] = useState(false)
  const [certFormTypeId, setCertFormTypeId] = useState('')
  const [certFormLevelId, setCertFormLevelId] = useState('')
  const [certFormIssuedAt, setCertFormIssuedAt] = useState('')
  const [certFormExpiresAt, setCertFormExpiresAt] = useState('')
  const [certFormNumber, setCertFormNumber] = useState('')
  const [certFormNotes, setCertFormNotes] = useState('')
  const [certFormBusy, setCertFormBusy] = useState(false)
  const [certFormError, setCertFormError] = useState<string | null>(null)

  // Editing existing cert
  const [editingCertId, setEditingCertId] = useState<string | null>(null)

  // Revoke
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null) // certTypeId
  const [revokeBusy, setRevokeBusy] = useState<string | null>(null)

  if (!staffMember) {
    return (
      <div>
        <p className="text-gray-500">Staff member not found.</p>
      </div>
    )
  }

  async function handleSaveRank() {
    setRankBusy(true)
    try {
      const result = await setStaffRankServerFn({
        data: {
          orgSlug: org.slug,
          staffMemberId: params.staffMemberId,
          rankId: selectedRankId || null,
        },
      })
      if (result.success) {
        const rank = ranks.find((r) => r.id === selectedRankId)
        setStaffMember((prev) =>
          prev
            ? { ...prev, rankId: selectedRankId || null, rankName: rank?.name ?? null, rankSortOrder: rank?.sortOrder ?? null }
            : prev,
        )
        setEditingRank(false)
      }
    } finally {
      setRankBusy(false)
    }
  }

  function resetCertForm() {
    setCertFormTypeId(''); setCertFormLevelId('')
    setCertFormIssuedAt(''); setCertFormExpiresAt('')
    setCertFormNumber(''); setCertFormNotes('')
    setCertFormError(null); setEditingCertId(null)
    setShowCertForm(false)
  }

  function startEditCert(cert: StaffCertView) {
    setCertFormTypeId(cert.certTypeId)
    setCertFormLevelId(cert.certLevelId ?? '')
    setCertFormIssuedAt(cert.issuedAt ?? '')
    setCertFormExpiresAt(cert.expiresAt ?? '')
    setCertFormNumber(cert.certNumber ?? '')
    setCertFormNotes(cert.notes ?? '')
    setEditingCertId(cert.certTypeId) // use certTypeId as key since it's unique per member
    setShowCertForm(true)
    setCertFormError(null)
  }

  async function handleUpsertCert(e: React.FormEvent) {
    e.preventDefault()
    setCertFormError(null)
    if (!certFormTypeId) { setCertFormError('Select a cert type.'); return }
    setCertFormBusy(true)
    try {
      const result = await upsertStaffCertServerFn({
        data: {
          orgSlug: org.slug,
          staffMemberId: params.staffMemberId,
          certTypeId: certFormTypeId,
          certLevelId: certFormLevelId || null,
          issuedAt: certFormIssuedAt || null,
          expiresAt: certFormExpiresAt || null,
          certNumber: certFormNumber || null,
          notes: certFormNotes || null,
        },
      })
      if (result.success) {
        setCerts((prev) => {
          const existing = prev.findIndex((c) => c.certTypeId === result.cert.certTypeId)
          if (existing >= 0) {
            return prev.map((c, i) => i === existing ? result.cert : c)
          }
          return [...prev, result.cert].sort((a, b) => a.certTypeName.localeCompare(b.certTypeName))
        })
        resetCertForm()
      } else {
        setCertFormError(result.error === 'VALIDATION_ERROR' ? 'Invalid cert level for this cert type.' : 'Failed to save certification.')
      }
    } finally {
      setCertFormBusy(false)
    }
  }

  async function handleRevoke(certTypeId: string) {
    setRevokeBusy(certTypeId)
    try {
      const result = await revokeStaffCertServerFn({
        data: { orgSlug: org.slug, staffMemberId: params.staffMemberId, certTypeId },
      })
      if (result.success) {
        setCerts((prev) => prev.map((c) => c.certTypeId === certTypeId ? { ...c, status: 'revoked', isExpiringSoon: false } : c))
        setConfirmRevoke(null)
      }
    } finally {
      setRevokeBusy(null)
    }
  }

  const selectedCertType = certTypes.find((ct) => ct.id === certFormTypeId)

  return (
    <div>
      {/* Profile header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy-700">{staffMember.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-gray-500">{ROLE_LABELS[staffMember.role] ?? staffMember.role}</span>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-500">{STATUS_LABELS[staffMember.status] ?? staffMember.status}</span>
              {staffMember.email && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm text-gray-500">{staffMember.email}</span>
                </>
              )}
              {staffMember.phone && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm text-gray-500">{staffMember.phone}</span>
                </>
              )}
            </div>
          </div>
          {/* Rank */}
          <div className="flex items-center gap-2">
            {editingRank && canManage ? (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={selectedRankId}
                    onChange={(e) => setSelectedRankId(e.target.value)}
                    className="appearance-none px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 pr-7"
                  >
                    <option value="">No rank</option>
                    {ranks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                <button onClick={() => void handleSaveRank()} disabled={rankBusy} className="px-3 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-xs font-semibold">
                  {rankBusy ? '…' : 'Save'}
                </button>
                <button onClick={() => { setEditingRank(false); setSelectedRankId(staffMember.rankId ?? '') }} className="p-2 text-gray-400 hover:bg-gray-100 rounded-md">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                className={`flex items-center gap-2 ${canManage ? 'cursor-pointer' : ''}`}
                onClick={() => { if (canManage) { setEditingRank(true); setSelectedRankId(staffMember.rankId ?? '') } }}
              >
                {staffMember.rankName ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-navy-700 text-white text-sm font-semibold">
                    <Star className="w-3.5 h-3.5" />
                    {staffMember.rankName}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">
                    {canManage ? 'Assign rank…' : 'No rank'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Certifications */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="flex items-center gap-2 text-base font-semibold text-navy-700">
            <Award className="w-4 h-4" />
            Certifications
          </h2>
          {canManage && !showCertForm && (
            <button
              onClick={() => setShowCertForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-semibold transition-colors"
            >
              Add / Update Cert
            </button>
          )}
        </div>

        {showCertForm && canManage && (
          <form onSubmit={handleUpsertCert} className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-3">
            <p className="text-sm font-medium text-navy-700">{editingCertId ? 'Update Certification' : 'Add / Update Certification'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cert Type <span className="text-danger">*</span></label>
                <div className="relative">
                  <select
                    value={certFormTypeId}
                    onChange={(e) => { setCertFormTypeId(e.target.value); setCertFormLevelId('') }}
                    className="w-full appearance-none px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
                    disabled={!!editingCertId}
                  >
                    <option value="">Select cert type…</option>
                    {certTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
              {selectedCertType?.isLeveled && selectedCertType.levels.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
                  <div className="relative">
                    <select
                      value={certFormLevelId}
                      onChange={(e) => setCertFormLevelId(e.target.value)}
                      className="w-full appearance-none px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
                    >
                      <option value="">No level</option>
                      {selectedCertType.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Issued At</label>
                <input type="date" value={certFormIssuedAt} onChange={(e) => setCertFormIssuedAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expires At</label>
                <input type="date" value={certFormExpiresAt} onChange={(e) => setCertFormExpiresAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cert Number</label>
                <input type="text" value={certFormNumber} onChange={(e) => setCertFormNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input type="text" value={certFormNotes} onChange={(e) => setCertFormNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white" />
              </div>
            </div>
            {certFormError && <p className="text-sm text-danger">{certFormError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={certFormBusy} className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold">
                {certFormBusy ? '…' : 'Save'}
              </button>
              <button type="button" onClick={resetCertForm} className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm">Cancel</button>
            </div>
          </form>
        )}

        {certs.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-400">No certifications on record.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Cert Type</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Level</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Status</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Issued</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>Expires</th>
                {canManage && <th className="w-24" />}
              </tr>
            </thead>
            <tbody>
              {certs.map((cert) => (
                <tr key={cert.certTypeId} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-navy-700">{cert.certTypeName}</td>
                  <td className="px-4 py-3 text-gray-600">{cert.certLevelName ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3">{certStatusBadge(cert.status, cert.isExpiringSoon)}</td>
                  <td className="px-4 py-3 text-gray-600">{cert.issuedAt ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{cert.expiresAt ?? <span className="text-gray-400">—</span>}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {cert.status !== 'revoked' && (
                          <>
                            <button
                              onClick={() => startEditCert(cert)}
                              className="px-2 py-1 text-xs text-gray-500 hover:text-navy-700 hover:bg-gray-100 rounded transition-colors font-medium"
                            >
                              Edit
                            </button>
                            {confirmRevoke === cert.certTypeId ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => void handleRevoke(cert.certTypeId)} disabled={revokeBusy === cert.certTypeId} className="px-2 py-0.5 bg-danger text-white rounded text-xs">
                                  {revokeBusy === cert.certTypeId ? '…' : 'Yes'}
                                </button>
                                <button onClick={() => setConfirmRevoke(null)} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmRevoke(cert.certTypeId)} className="px-2 py-1 text-xs text-gray-400 hover:text-danger hover:bg-danger-bg rounded transition-colors font-medium">
                                Revoke
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
