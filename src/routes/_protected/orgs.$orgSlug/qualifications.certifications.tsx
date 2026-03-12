import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { Shield, AlertTriangle, CheckCircle, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import { type OrgCertView, type CertTypeView } from '@/lib/qualifications.types'
import {
  listOrgCertsServerFn,
  listCertTypesServerFn,
  upsertStaffCertServerFn,
  revokeStaffCertServerFn,
} from '@/server/qualifications'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/qualifications/certifications')({
  head: () => ({
    meta: [{ title: 'Certification Status | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const [certsResult, certTypesResult] = await Promise.all([
      listOrgCertsServerFn({ data: { orgSlug: params.orgSlug } }),
      listCertTypesServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    return {
      certs: certsResult.success ? certsResult.certs : [],
      certTypes: certTypesResult.success ? certTypesResult.certTypes : [],
    }
  },
  component: CertificationsPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortCol = 'staff' | 'certType' | 'issued' | 'expires' | 'status'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'active' | 'expiring_soon' | 'expired' | 'revoked'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(dateStr: string, today: string): number {
  return Math.ceil(
    (new Date(dateStr + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) /
      86400000,
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function certStatusBadge(status: OrgCertView['status'], isExpiringSoon: boolean) {
  if (isExpiringSoon) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-warning-bg text-warning"
        style={{ fontFamily: 'var(--font-condensed)' }}
      >
        <AlertTriangle className="w-3 h-3" />
        Expiring Soon
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-success-bg text-success"
        style={{ fontFamily: 'var(--font-condensed)' }}
      >
        Active
      </span>
    )
  }
  if (status === 'expired') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-danger-bg text-danger"
        style={{ fontFamily: 'var(--font-condensed)' }}
      >
        Expired
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-500"
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      Revoked
    </span>
  )
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function sortKey(c: OrgCertView, col: SortCol): string {
  switch (col) {
    case 'staff': return c.staffMemberName.toLowerCase()
    case 'certType': return c.certTypeName.toLowerCase()
    case 'issued': return c.issuedAt ?? ''
    case 'expires': return c.expiresAt ?? '\uffff' // null sorts last
    case 'status': {
      if (c.isExpiringSoon) return '1-expiring'
      if (c.status === 'expired') return '0-expired'
      if (c.status === 'active') return '2-active'
      return '3-revoked'
    }
  }
}

function applyFiltersAndSort(
  certs: OrgCertView[],
  nameFilter: string,
  certTypeFilter: string,
  statusFilter: StatusFilter,
  sortCol: SortCol,
  sortDir: SortDir,
): OrgCertView[] {
  let result = certs

  if (nameFilter.trim()) {
    const q = nameFilter.trim().toLowerCase()
    result = result.filter((c) => c.staffMemberName.toLowerCase().includes(q))
  }

  if (certTypeFilter) {
    result = result.filter((c) => c.certTypeId === certTypeFilter)
  }

  if (statusFilter !== 'all') {
    result = result.filter((c) => {
      if (statusFilter === 'expiring_soon') return c.isExpiringSoon
      if (statusFilter === 'active') return c.status === 'active' && !c.isExpiringSoon
      return c.status === statusFilter
    })
  }

  result = [...result].sort((a, b) => {
    const ka = sortKey(a, sortCol)
    const kb = sortKey(b, sortCol)
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  return result
}

// ---------------------------------------------------------------------------
// Sort header button
// ---------------------------------------------------------------------------

function SortTh({
  label,
  col,
  sortCol,
  sortDir,
  onSort,
}: {
  label: string
  col: SortCol
  sortCol: SortCol
  sortDir: SortDir
  onSort: (col: SortCol) => void
}) {
  const active = sortCol === col
  return (
    <th className="px-4 py-2.5 text-left">
      <button
        onClick={() => onSort(col)}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600 hover:text-navy-700 transition-colors"
        style={{ fontFamily: 'var(--font-condensed)' }}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 text-gray-400" />
        )}
      </button>
    </th>
  )
}

// ---------------------------------------------------------------------------
// Inline edit form row
// ---------------------------------------------------------------------------

function EditFormRow({
  cert,
  certType,
  orgSlug,
  colSpan,
  onSave,
  onCancel,
}: {
  cert: OrgCertView
  certType: CertTypeView | undefined
  orgSlug: string
  colSpan: number
  onSave: (updated: OrgCertView) => void
  onCancel: () => void
}) {
  const [levelId, setLevelId] = useState(cert.certLevelId ?? '')
  const [issuedAt, setIssuedAt] = useState(cert.issuedAt ?? '')
  const [expiresAt, setExpiresAt] = useState(cert.expiresAt ?? '')
  const [certNumber, setCertNumber] = useState(cert.certNumber ?? '')
  const [notes, setNotes] = useState(cert.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await upsertStaffCertServerFn({
        data: {
          orgSlug,
          staffMemberId: cert.staffMemberId,
          certTypeId: cert.certTypeId,
          certLevelId: levelId || null,
          issuedAt: issuedAt || null,
          expiresAt: expiresAt || null,
          certNumber: certNumber || null,
          notes: notes || null,
        },
      })
      if (result.success) {
        onSave({
          ...cert,
          certLevelId: result.cert.certLevelId,
          certLevelName: result.cert.certLevelName,
          issuedAt: result.cert.issuedAt,
          expiresAt: result.cert.expiresAt,
          certNumber: result.cert.certNumber,
          notes: result.cert.notes,
          status: result.cert.status,
          isExpiringSoon: result.cert.isExpiringSoon,
        })
      } else {
        setError(result.error === 'VALIDATION_ERROR' ? 'Invalid cert level for this cert type.' : 'Failed to save.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm font-medium text-navy-700">
            Editing: {cert.staffMemberName} — {cert.certTypeName}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {certType?.isLeveled && certType.levels.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
                <div className="relative">
                  <select
                    value={levelId}
                    onChange={(e) => setLevelId(e.target.value)}
                    className="w-full appearance-none px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
                  >
                    <option value="">No level</option>
                    {certType.levels.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Issued At</label>
              <input
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expires At</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cert Number</label>
              <input
                type="text"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
              />
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold"
            >
              {busy ? '…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function CertificationsPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { certs: initialCerts, certTypes } = Route.useLoaderData()
  const [certs, setCerts] = useState<OrgCertView[]>(initialCerts)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [revokeBusy, setRevokeBusy] = useState<string | null>(null)

  // Filters
  const [nameFilter, setNameFilter] = useState('')
  const [certTypeFilter, setCertTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>('staff')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const canManage = canDo(userRole, 'manage-certifications')

  if (!canDo(userRole, 'view-certifications')) {
    return (
      <div className="p-8 text-center text-gray-500">
        You don't have permission to view certification status.
      </div>
    )
  }

  const today = todayStr()
  const expired = certs.filter((c) => c.status === 'expired')
  const expiringSoon = certs.filter((c) => c.isExpiringSoon)

  const visibleCerts = applyFiltersAndSort(certs, nameFilter, certTypeFilter, statusFilter, sortCol, sortDir)

  const hasFilters = nameFilter.trim() !== '' || certTypeFilter !== '' || statusFilter !== 'all'

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setEditingId(null)
  }

  function clearFilters() {
    setNameFilter('')
    setCertTypeFilter('')
    setStatusFilter('all')
  }

  async function handleRevoke(cert: OrgCertView) {
    setRevokeBusy(cert.id)
    try {
      const result = await revokeStaffCertServerFn({
        data: { orgSlug: org.slug, staffMemberId: cert.staffMemberId, certTypeId: cert.certTypeId },
      })
      if (result.success) {
        setCerts((prev) =>
          prev.map((c) =>
            c.id === cert.id ? { ...c, status: 'revoked', isExpiringSoon: false } : c,
          ),
        )
        setConfirmRevoke(null)
      }
    } finally {
      setRevokeBusy(null)
    }
  }

  const colSpan = canManage ? 7 : 6

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-navy-700" />
          <h1 className="text-2xl font-bold text-navy-700">Certification Status</h1>
        </div>
        <p className="text-gray-500 text-sm mt-1">
          Org-wide view of all staff certifications for {org.name}.
        </p>
      </div>

      {/* Alert widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Expired */}
        <div
          className={`border rounded-lg p-4 ${
            expired.length > 0 ? 'border-danger bg-danger-bg' : 'border-success bg-success-bg'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            {expired.length > 0 ? (
              <>
                <AlertTriangle className="w-5 h-5 text-danger" />
                <h2 className="font-semibold text-danger">Expired Certifications</h2>
                <span
                  className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-danger-bg text-danger border border-danger"
                  style={{ fontFamily: 'var(--font-condensed)' }}
                >
                  {expired.length}
                </span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-success" />
                <h2 className="font-semibold text-success">No Expired Certifications</h2>
              </>
            )}
          </div>
          {expired.length > 0 ? (
            <ul className="space-y-1">
              {expired.map((c) => (
                <li key={c.id} className="text-sm text-danger">
                  <Link
                    to="/orgs/$orgSlug/staff/$staffMemberId"
                    params={{ orgSlug: org.slug, staffMemberId: c.staffMemberId }}
                    className="font-medium hover:underline"
                  >
                    {c.staffMemberName}
                  </Link>
                  {' — '}
                  {c.certTypeName}
                  {c.certLevelName ? ` (${c.certLevelName})` : ''}
                  {c.expiresAt ? ` · expired ${formatDate(c.expiresAt)}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-success">All certifications are current.</p>
          )}
        </div>

        {/* Expiring Soon */}
        <div
          className={`border rounded-lg p-4 ${
            expiringSoon.length > 0
              ? 'border-warning bg-warning-bg'
              : 'border-success bg-success-bg'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            {expiringSoon.length > 0 ? (
              <>
                <AlertTriangle className="w-5 h-5 text-warning" />
                <h2 className="font-semibold text-warning">Expiring Within 30 Days</h2>
                <span
                  className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-warning-bg text-warning border border-warning"
                  style={{ fontFamily: 'var(--font-condensed)' }}
                >
                  {expiringSoon.length}
                </span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-success" />
                <h2 className="font-semibold text-success">No Upcoming Expirations</h2>
              </>
            )}
          </div>
          {expiringSoon.length > 0 ? (
            <ul className="space-y-1">
              {expiringSoon.map((c) => (
                <li key={c.id} className="text-sm text-warning">
                  <Link
                    to="/orgs/$orgSlug/staff/$staffMemberId"
                    params={{ orgSlug: org.slug, staffMemberId: c.staffMemberId }}
                    className="font-medium hover:underline"
                  >
                    {c.staffMemberName}
                  </Link>
                  {' — '}
                  {c.certTypeName}
                  {c.certLevelName ? ` (${c.certLevelName})` : ''}
                  {c.expiresAt ? ` · ${daysUntil(c.expiresAt, today)}d remaining` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-success">No certifications expiring in the next 30 days.</p>
          )}
        </div>
      </div>

      {/* Full table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Table toolbar */}
        <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-navy-700 mr-auto">All Certifications</h2>
          {/* Name search */}
          <input
            type="search"
            placeholder="Search by name…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 w-44"
          />
          {/* Cert type filter */}
          <div className="relative">
            <select
              value={certTypeFilter}
              onChange={(e) => setCertTypeFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
            >
              <option value="">All cert types</option>
              {certTypes.map((ct: CertTypeView) => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="appearance-none pl-3 pr-7 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-navy-500 bg-white"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>
            <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {certs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No certifications on record for active staff.
          </div>
        ) : visibleCerts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No certifications match the current filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <SortTh label="Staff" col="staff" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Cert Type" col="certType" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Level</th>
                <SortTh label="Issued" col="issued" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Expires" col="expires" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Status" col="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                {canManage && <th className="w-28" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleCerts.map((c) => {
                const isEditing = editingId === c.id
                const certType = certTypes.find((ct: CertTypeView) => ct.id === c.certTypeId)
                return (
                  <>
                    <tr key={c.id} className={isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-2.5">
                        <Link
                          to="/orgs/$orgSlug/staff/$staffMemberId"
                          params={{ orgSlug: org.slug, staffMemberId: c.staffMemberId }}
                          className="font-medium text-navy-700 hover:underline"
                        >
                          {c.staffMemberName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{c.certTypeName}</td>
                      <td className="px-4 py-2.5 text-gray-500">{c.certLevelName ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {c.issuedAt ? formatDate(c.issuedAt) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {c.expiresAt ? formatDate(c.expiresAt) : '—'}
                      </td>
                      <td className="px-4 py-2.5">{certStatusBadge(c.status, c.isExpiringSoon)}</td>
                      {canManage && (
                        <td className="px-4 py-2.5">
                          {c.status !== 'revoked' && !isEditing && (
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => { setEditingId(c.id); setConfirmRevoke(null) }}
                                className="px-2 py-1 text-xs text-gray-500 hover:text-navy-700 hover:bg-gray-100 rounded transition-colors font-medium"
                              >
                                Edit
                              </button>
                              {confirmRevoke === c.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => void handleRevoke(c)}
                                    disabled={revokeBusy === c.id}
                                    className="px-2 py-0.5 bg-danger text-white rounded text-xs"
                                  >
                                    {revokeBusy === c.id ? '…' : 'Yes'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmRevoke(null)}
                                    className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmRevoke(c.id)}
                                  className="px-2 py-1 text-xs text-gray-400 hover:text-danger hover:bg-danger-bg rounded transition-colors font-medium"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          )}
                          {isEditing && (
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 rounded transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {isEditing && (
                      <EditFormRow
                        key={`edit-${c.id}`}
                        cert={c}
                        certType={certType}
                        orgSlug={org.slug}
                        colSpan={colSpan}
                        onSave={(updated) => {
                          setCerts((prev) => prev.map((x) => x.id === updated.id ? updated : x))
                          setEditingId(null)
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Row count */}
        {visibleCerts.length > 0 && visibleCerts.length !== certs.length && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            Showing {visibleCerts.length} of {certs.length} certifications
          </div>
        )}
      </div>
    </div>
  )
}
