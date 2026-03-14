import { useState } from 'react'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { AlertTriangle, Star, Award, ChevronDown, Layers, Pencil, X } from 'lucide-react'
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
import { listPlatoonsServerFn, getStaffPlatoonServerFn, assignMemberServerFn, removeMemberFromPlatoonServerFn } from '@/server/platoons'
import { updateStaffMemberServerFn } from '@/server/staff'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/staff/$staffMemberId')({
  loader: async ({ params }) => {
    const [detailResult, ranksResult, certTypesResult, platoonsResult, staffPlatoonResult] = await Promise.all([
      getStaffMemberDetailsServerFn({
        data: { orgSlug: params.orgSlug, staffMemberId: params.staffMemberId },
      }),
      listRanksServerFn({ data: { orgSlug: params.orgSlug } }),
      listCertTypesServerFn({ data: { orgSlug: params.orgSlug } }),
      listPlatoonsServerFn({ data: { orgSlug: params.orgSlug } }),
      getStaffPlatoonServerFn({ data: { orgSlug: params.orgSlug, staffMemberId: params.staffMemberId } }),
    ])
    return {
      staffMember: detailResult.success ? detailResult.staffMember : null,
      certs: detailResult.success ? detailResult.certs : [],
      ranks: ranksResult.success ? ranksResult.ranks : [],
      certTypes: certTypesResult.success ? certTypesResult.certTypes : [],
      platoons: platoonsResult.success ? platoonsResult.platoons : [],
      currentPlatoonId: staffPlatoonResult.success ? staffPlatoonResult.platoonId : null,
      currentPlatoonName: staffPlatoonResult.success ? staffPlatoonResult.platoonName : null,
      currentPositionId: staffPlatoonResult.success ? staffPlatoonResult.positionId : null,
      currentPositionName: staffPlatoonResult.success ? staffPlatoonResult.positionName : null,
      positions: staffPlatoonResult.success ? staffPlatoonResult.positions : [],
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.staffMember?.name ?? 'Staff Detail'} | Scene Ready` }],
  }),
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
  const orgSlug = org.slug
  const canManage = canDo(userRole, 'manage-certifications')
  const canManagePlatoon = canDo(userRole, 'create-edit-schedules')

  const [staffMember, setStaffMember] = useState<StaffMemberDetailView | null>(loaderData.staffMember)
  const [certs, setCerts] = useState<StaffCertView[]>(loaderData.certs)
  const { ranks, certTypes } = loaderData

  const canEditDetails = canDo(userRole, 'invite-members')

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false)
  const [editName, setEditName] = useState(staffMember?.name ?? '')
  const [editEmail, setEditEmail] = useState(staffMember?.email ?? '')
  const [editPhone, setEditPhone] = useState(staffMember?.phone ?? '')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Rank editing
  const [editingRank, setEditingRank] = useState(false)
  const [selectedRankId, setSelectedRankId] = useState(staffMember?.rankId ?? '')
  const [rankBusy, setRankBusy] = useState(false)

  // Platoon
  const [platoonId, setPlatoonId] = useState<string | null>(loaderData.currentPlatoonId)
  const [platoonName, setPlatoonName] = useState<string | null>(loaderData.currentPlatoonName)
  const [positionId, setPositionId] = useState<string | null>(loaderData.currentPositionId)
  const [positionName, setPositionName] = useState<string | null>(loaderData.currentPositionName)
  const [platoonSelectId, setPlatoonSelectId] = useState<string>(loaderData.currentPlatoonId ?? '')
  const [positionSelectId, setPositionSelectId] = useState<string>(loaderData.currentPositionId ?? '')
  const [editingPlatoon, setEditingPlatoon] = useState(false)
  const [platoonMoveConfirm, setPlatoonMoveConfirm] = useState(false)
  const [platoonBusy, setPlatoonBusy] = useState(false)

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

  async function handleSaveProfile() {
    if (!editName.trim()) { setProfileError('Name is required.'); return }
    setProfileError(null)
    setProfileBusy(true)
    try {
      const result = await updateStaffMemberServerFn({
        data: {
          orgSlug: org.slug,
          staffMemberId: params.staffMemberId,
          name: editName.trim(),
          email: editEmail.trim().toLowerCase() || null,
          phone: editPhone.trim() || null,
        },
      })
      if (result.success) {
        setStaffMember((prev) =>
          prev
            ? { ...prev, name: editName.trim(), email: editEmail.trim().toLowerCase() || null, phone: editPhone.trim() || null }
            : prev,
        )
        setEditingProfile(false)
      } else {
        setProfileError(result.error === 'DUPLICATE_EMAIL' ? 'That email is already used by another staff member.' : 'Failed to save changes.')
      }
    } finally {
      setProfileBusy(false)
    }
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

  async function handleSavePlatoon() {
    setPlatoonBusy(true)
    try {
      if (!platoonSelectId) {
        if (platoonId) {
          const result = await removeMemberFromPlatoonServerFn({
            data: { orgSlug, platoonId, staffMemberId: params.staffMemberId },
          })
          if (result.success) {
            setPlatoonId(null); setPlatoonName(null)
            setPositionId(null); setPositionName(null)
          }
        }
      } else {
        const result = await assignMemberServerFn({
          data: { orgSlug, platoonId: platoonSelectId, staffMemberId: params.staffMemberId, positionId: positionSelectId || undefined },
        })
        if (result.success) {
          const found = loaderData.platoons.find((p) => p.id === platoonSelectId)
          setPlatoonId(platoonSelectId)
          setPlatoonName(found?.name ?? null)
          const foundPos = loaderData.positions.find((p) => p.id === positionSelectId)
          setPositionId(positionSelectId || null)
          setPositionName(foundPos?.name ?? null)
        }
      }
      setEditingPlatoon(false)
      setPlatoonMoveConfirm(false)
    } finally {
      setPlatoonBusy(false)
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

  async function handleUpsertCert(e: React.SubmitEvent<HTMLFormElement>) {
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
          <div className="flex-1 min-w-0">
            {editingProfile ? (
              <div className="space-y-3 max-w-md">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500"
                  />
                </div>
                {profileError && <p className="text-sm text-danger">{profileError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleSaveProfile()}
                    disabled={profileBusy}
                    className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold"
                  >
                    {profileBusy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingProfile(false); setProfileError(null); setEditName(staffMember.name); setEditEmail(staffMember.email ?? ''); setEditPhone(staffMember.phone ?? '') }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-navy-700">{staffMember.name}</h1>
                  {canEditDetails && (
                    <button
                      onClick={() => { setEditName(staffMember.name); setEditEmail(staffMember.email ?? ''); setEditPhone(staffMember.phone ?? ''); setEditingProfile(true) }}
                      className="p-1 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded transition-colors"
                      title="Edit staff details"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
              </>
            )}
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

      {/* Platoon */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-navy-700 flex items-center gap-2">
            <Layers className="w-4 h-4" /> Platoon
          </h2>
          {canManagePlatoon && !editingPlatoon && (
            <button
              onClick={() => { setEditingPlatoon(true); setPlatoonSelectId(platoonId ?? ''); setPositionSelectId(positionId ?? '') }}
              className="text-xs text-gray-500 hover:text-navy-700 font-medium"
            >
              Change
            </button>
          )}
        </div>

        {editingPlatoon ? (
          <div className="space-y-3">
            <div className="relative">
              <select
                value={platoonSelectId}
                onChange={(e) => { setPlatoonSelectId(e.target.value); setPlatoonMoveConfirm(false) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700 appearance-none bg-white"
              >
                <option value="">Unassigned</option>
                {loaderData.platoons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {platoonSelectId && loaderData.positions.length > 0 && (
              <div className="relative">
                <select
                  value={positionSelectId}
                  onChange={(e) => setPositionSelectId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700 appearance-none bg-white"
                >
                  <option value="">No position</option>
                  {loaderData.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            {platoonMoveConfirm && (
              <div className="px-3 py-2 bg-warning-bg text-warning rounded-lg text-sm">
                This will move <strong>{staffMember.name}</strong> from <strong>{platoonName}</strong> to the selected platoon.
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const isMove = platoonSelectId && platoonId && platoonSelectId !== platoonId
                  if (isMove && !platoonMoveConfirm) { setPlatoonMoveConfirm(true); return }
                  void handleSavePlatoon()
                }}
                disabled={platoonBusy}
                className="px-4 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 disabled:opacity-50"
              >
                {platoonBusy ? 'Saving…' : platoonMoveConfirm ? 'Confirm Move' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingPlatoon(false); setPlatoonMoveConfirm(false) }}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              {platoonName ?? <span className="text-gray-400 italic">Unassigned</span>}
            </span>
            {positionName && (
              <span
                className="rounded-full text-xs font-semibold uppercase tracking-wide px-2 py-0.5 bg-gray-100 text-gray-600"
                style={{ fontFamily: 'var(--font-condensed)' }}
              >
                {positionName}
              </span>
            )}
          </div>
        )}
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
