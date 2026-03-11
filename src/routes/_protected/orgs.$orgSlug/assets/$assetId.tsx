import { useState } from 'react'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { canDo } from '@/lib/rbac'
import type {
  AssetDetailView,
  InspectionView,
  AssetAuditEntry,
  AssetView,
} from '@/lib/asset.types'
import {
  APPARATUS_STATUSES,
  GEAR_STATUSES,
} from '@/lib/asset.types'
import {
  getAssetServerFn,
  assignGearServerFn,
  unassignGearServerFn,
  logInspectionServerFn,
  getInspectionHistoryServerFn,
  getAssetAuditLogServerFn,
  changeAssetStatusServerFn,
  updateAssetServerFn,
  setInspectionIntervalServerFn,
} from '@/server/assets'
import { listStaffServerFn } from '@/server/staff'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets/$assetId')({
  head: () => ({ meta: [{ title: 'Asset Detail | Scene Ready' }] }),
  loader: async ({ params }) => {
    const [assetResult, staffResult] = await Promise.all([
      getAssetServerFn({ data: { orgSlug: params.orgSlug, assetId: params.assetId } }),
      listStaffServerFn({ data: { orgSlug: params.orgSlug } }),
    ])
    if (!assetResult.success) return { asset: null, staffList: [] }
    return {
      asset: assetResult.asset,
      staffList: staffResult.success ? staffResult.members : [],
    }
  },
  component: AssetDetailPage,
})

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'Engine', ladder_truck: 'Ladder Truck', ambulance_medic: 'Ambulance/Medic',
  battalion_chief: 'Battalion Chief', rescue: 'Rescue', brush_wildland: 'Brush/Wildland',
  tanker_tender: 'Tanker/Tender', boat: 'Boat', atv_utv: 'ATV/UTV',
  command_vehicle: 'Command Vehicle', utility: 'Utility',
  scba: 'SCBA', ppe: 'PPE', radio: 'Radio', medical_equipment: 'Medical Equipment',
  tools: 'Tools', hose: 'Hose', nozzle: 'Nozzle', thermal_camera: 'Thermal Camera',
  gas_detector: 'Gas Detector', lighting: 'Lighting', extrication: 'Extrication',
  rope_rescue: 'Rope Rescue', water_rescue: 'Water Rescue', hazmat: 'HazMat', other: 'Other',
}

const STATUS_LABELS: Record<string, string> = {
  in_service: 'In Service', out_of_service: 'Out of Service', reserve: 'Reserve',
  decommissioned: 'Decommissioned', available: 'Available', assigned: 'Assigned', expired: 'Expired',
}

function orgToday(scheduleDayStart: string): string {
  const now = new Date()
  const [h, m] = scheduleDayStart.split(':').map(Number)
  const dayStartMs = ((h ?? 0) * 60 + (m ?? 0)) * 60 * 1000
  const utcMs = now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000
  const effectiveDate = utcMs < dayStartMs ? new Date(now.getTime() - 86400000) : now
  return effectiveDate.toISOString().slice(0, 10)
}

const INTERVAL_PRESETS = [
  { label: 'Daily', days: 1 },
  { label: 'Weekly', days: 7 },
  { label: 'Monthly', days: 30 },
  { label: 'Quarterly', days: 90 },
  { label: 'Semi-Annual', days: 182 },
  { label: 'Annual', days: 365 },
]

function statusBadge(status: string) {
  const label = STATUS_LABELS[status] ?? status
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide'
  if (status === 'in_service' || status === 'available') {
    return <span className={`${base} bg-success-bg text-success`} style={{ fontFamily: 'var(--font-condensed)' }}>{label}</span>
  }
  if (status === 'decommissioned' || status === 'expired') {
    return <span className={`${base} bg-gray-100 text-gray-500`} style={{ fontFamily: 'var(--font-condensed)' }}>{label}</span>
  }
  if (status === 'out_of_service') {
    return <span className={`${base} bg-danger-bg text-danger`} style={{ fontFamily: 'var(--font-condensed)' }}>{label}</span>
  }
  return <span className={`${base} bg-warning-bg text-warning`} style={{ fontFamily: 'var(--font-condensed)' }}>{label}</span>
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ fontFamily: 'var(--font-condensed)' }}>{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value ?? <span className="text-gray-300">—</span>}</dd>
    </div>
  )
}

type StaffMember = { memberId: string; displayName: string; userId: string; email: string; role: string; joinedAt: string }

function AssetDetailPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { asset: initialAsset, staffList } = Route.useLoaderData()

  const [asset, setAsset] = useState<AssetDetailView | null>(initialAsset)
  const [activeTab, setActiveTab] = useState<'details' | 'inspections' | 'audit'>('details')

  // Assignment state
  const [assignMode, setAssignMode] = useState<'staff' | 'apparatus'>('staff')
  const [assignStaffId, setAssignStaffId] = useState('')
  const [assignApparatusId, setAssignApparatusId] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Inspection state
  const [inspResult, setInspResult] = useState<'pass' | 'fail'>('pass')
  const [inspNotes, setInspNotes] = useState('')
  const [inspDate, setInspDate] = useState('')
  const [inspBusy, setInspBusy] = useState(false)
  const [inspError, setInspError] = useState<string | null>(null)
  const [inspections, setInspections] = useState<InspectionView[]>([])
  const [inspTotal, setInspTotal] = useState(0)
  const [inspLoaded, setInspLoaded] = useState(false)
  const [inspOffset, setInspOffset] = useState(0)

  // Audit state
  const [auditEntries, setAuditEntries] = useState<AssetAuditEntry[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLoaded, setAuditLoaded] = useState(false)
  const [auditOffset, setAuditOffset] = useState(0)

  // Status change state
  const [newStatus, setNewStatus] = useState('')
  const [confirmDecomm, setConfirmDecomm] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Edit state
  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editMake, setEditMake] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editSerial, setEditSerial] = useState('')
  const [editExpiration, setEditExpiration] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Interval state
  const [intervalBusy, setIntervalBusy] = useState(false)

  const canManage = canDo(userRole, 'manage-assets')
  const LIMIT = 50

  if (!asset) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg py-16 text-center">
        <p className="text-gray-500 text-sm">Asset not found.</p>
      </div>
    )
  }

  const isDecommissioned = asset.status === 'decommissioned'
  const isGear = asset.assetType === 'gear'
  const statuses = isGear ? GEAR_STATUSES : APPARATUS_STATUSES

  async function handleAssign() {
    if (!isGear) return
    setAssignError(null)
    setAssignBusy(true)
    const result = await assignGearServerFn({
      data: {
        orgSlug: org.slug,
        assetId: asset.id,
        assignToStaffId: assignMode === 'staff' ? assignStaffId || undefined : undefined,
        assignToApparatusId: assignMode === 'apparatus' ? assignApparatusId || undefined : undefined,
      },
    })
    setAssignBusy(false)
    if (!result.success) {
      setAssignError(result.error)
      return
    }
    setAsset((a) => a ? { ...a, ...result.asset } : a)
    setAssignStaffId('')
    setAssignApparatusId('')
  }

  async function handleUnassign() {
    setAssignBusy(true)
    const result = await unassignGearServerFn({ data: { orgSlug: org.slug, assetId: asset.id } })
    setAssignBusy(false)
    if (result.success) setAsset((a) => a ? { ...a, ...result.asset } : a)
  }

  async function handleLogInspection(e: React.FormEvent) {
    e.preventDefault()
    setInspError(null)
    setInspBusy(true)
    const result = await logInspectionServerFn({
      data: {
        orgSlug: org.slug,
        assetId: asset.id,
        result: inspResult,
        notes: inspNotes || undefined,
        inspectionDate: inspDate || undefined,
      },
    })
    setInspBusy(false)
    if (!result.success) { setInspError(result.error); return }
    setInspNotes('')
    setInspDate('')
    setInspResult('pass')
    // Reload inspections if tab is open
    if (inspLoaded) {
      const r = await getInspectionHistoryServerFn({ data: { orgSlug: org.slug, assetId: asset.id, limit: LIMIT, offset: 0 } })
      if (r.success) { setInspections(r.inspections); setInspTotal(r.total); setInspOffset(0) }
    }
    // Update asset's nextInspectionDue
    const updated = await getAssetServerFn({ data: { orgSlug: org.slug, assetId: asset.id } })
    if (updated.success) setAsset(updated.asset)
  }

  async function loadInspections(off = 0) {
    const result = await getInspectionHistoryServerFn({ data: { orgSlug: org.slug, assetId: asset.id, limit: LIMIT, offset: off } })
    if (result.success) {
      setInspections(result.inspections)
      setInspTotal(result.total)
      setInspLoaded(true)
      setInspOffset(off)
    }
  }

  async function loadAudit(off = 0) {
    const result = await getAssetAuditLogServerFn({ data: { orgSlug: org.slug, assetId: asset.id, limit: LIMIT, offset: off } })
    if (result.success) {
      setAuditEntries(result.entries)
      setAuditTotal(result.total)
      setAuditLoaded(true)
      setAuditOffset(off)
    }
  }

  async function handleTabChange(tab: 'details' | 'inspections' | 'audit') {
    setActiveTab(tab)
    if (tab === 'inspections' && !inspLoaded) await loadInspections()
    if (tab === 'audit' && !auditLoaded) await loadAudit()
  }

  async function handleStatusChange() {
    if (!newStatus) return
    if (newStatus === 'decommissioned' && !confirmDecomm) {
      setConfirmDecomm(true)
      return
    }
    setStatusBusy(true)
    const result = await changeAssetStatusServerFn({ data: { orgSlug: org.slug, assetId: asset.id, newStatus } })
    setStatusBusy(false)
    if (!result.success) { setStatusError(result.error); return }
    setAsset((a) => a ? { ...a, ...(result.asset as AssetView), notes: a.notes, manufactureDate: a.manufactureDate, purchasedDate: a.purchasedDate, inServiceDate: a.inServiceDate, warrantyExpirationDate: a.warrantyExpirationDate, inspectionIntervalDays: a.inspectionIntervalDays, customFields: a.customFields } : a)
    setNewStatus('')
    setConfirmDecomm(false)
  }

  function openEdit() {
    setEditName(asset.name)
    setEditNotes(asset.notes ?? '')
    setEditMake(asset.make ?? '')
    setEditModel(asset.model ?? '')
    setEditSerial(asset.serialNumber ?? '')
    setEditExpiration(asset.expirationDate ?? '')
    setEditError(null)
    setShowEdit(true)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    setEditError(null)
    setEditBusy(true)
    const result = await updateAssetServerFn({
      data: {
        orgSlug: org.slug,
        assetId: asset.id,
        name: editName.trim() || undefined,
        make: editMake.trim() || null,
        model: editModel.trim() || null,
        notes: editNotes.trim() || null,
        serialNumber: editSerial.trim() || null,
        expirationDate: editExpiration || null,
      },
    })
    setEditBusy(false)
    if (!result.success) { setEditError(result.error); return }
    const updated = await getAssetServerFn({ data: { orgSlug: org.slug, assetId: asset.id } })
    if (updated.success) setAsset(updated.asset)
    setShowEdit(false)
  }

  async function handleSetInterval(days: number | null) {
    setIntervalBusy(true)
    const result = await setInspectionIntervalServerFn({ data: { orgSlug: org.slug, assetId: asset.id, intervalDays: days } })
    setIntervalBusy(false)
    if (result.success) {
      setAsset((a) => a ? { ...a, inspectionIntervalDays: days, nextInspectionDue: result.asset.nextInspectionDue } : a)
    }
  }

  const inputClass = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-700'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
                {asset.name}
              </h2>
              {statusBadge(asset.status)}
            </div>
            <div className="flex gap-4 mt-1 text-sm text-gray-500">
              <span>{asset.assetType === 'apparatus' ? 'Apparatus' : 'Gear'}</span>
              <span>·</span>
              <span>{CATEGORY_LABELS[asset.category] ?? asset.category}</span>
              {asset.unitNumber && <><span>·</span><span className="font-mono">{asset.unitNumber}</span></>}
              {asset.serialNumber && <><span>·</span><span className="font-mono text-xs">{asset.serialNumber}</span></>}
            </div>
          </div>
          {canManage && !isDecommissioned && (
            <button onClick={openEdit} className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['details', 'inspections', 'audit'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-navy-700 text-navy-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            {tab === 'audit' ? 'Audit Log' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab: Details */}
      {activeTab === 'details' && (
        <div className="space-y-6">
          {/* Core fields */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>Asset Info</h3>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Name" value={asset.name} />
              <Field label="Category" value={CATEGORY_LABELS[asset.category] ?? asset.category} />
              <Field label="Status" value={STATUS_LABELS[asset.status] ?? asset.status} />
              {asset.unitNumber && <Field label="Unit Number" value={asset.unitNumber} />}
              <Field label="Make" value={asset.make} />
              <Field label="Model" value={asset.model} />
              <Field label="Serial Number" value={asset.serialNumber} />
            </dl>
            {asset.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>Notes</dt>
                <dd className="text-sm text-gray-900 whitespace-pre-line">{asset.notes}</dd>
              </div>
            )}
          </div>

          {/* Lifecycle dates */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>Lifecycle</h3>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Manufactured" value={asset.manufactureDate} />
              <Field label="Purchased" value={asset.purchasedDate} />
              <Field label="In Service" value={asset.inServiceDate} />
              <Field label="Expires" value={asset.expirationDate} />
              <Field label="Warranty Expires" value={asset.warrantyExpirationDate} />
            </dl>
          </div>

          {/* Custom fields */}
          {asset.customFields && Object.keys(asset.customFields).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>Custom Fields</h3>
              <dl className="grid grid-cols-2 gap-3">
                {Object.entries(asset.customFields).map(([k, v]) => (
                  <Field key={k} label={k} value={String(v)} />
                ))}
              </dl>
            </div>
          )}

          {/* Inspection Schedule */}
          {canManage && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Inspection Schedule</h3>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {INTERVAL_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    disabled={intervalBusy}
                    onClick={() => handleSetInterval(preset.days)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${asset.inspectionIntervalDays === preset.days ? 'bg-navy-700 text-white border-navy-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  disabled={intervalBusy}
                  onClick={() => handleSetInterval(null)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${!asset.inspectionIntervalDays ? 'bg-navy-700 text-white border-navy-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  None
                </button>
              </div>
              {asset.nextInspectionDue && (() => {
                const today = orgToday(org.scheduleDayStart)
                const isOverdue = asset.nextInspectionDue < today
                const isDueToday = asset.nextInspectionDue === today
                return (
                  <p className={`text-sm ${isOverdue ? 'text-danger font-semibold' : isDueToday ? 'text-warning font-semibold' : 'text-gray-600'}`}>
                    Next inspection due: {asset.nextInspectionDue}
                    {isOverdue && ' (OVERDUE)'}
                    {isDueToday && ' (due today)'}
                  </p>
                )
              })()}
            </div>
          )}

          {/* Status Change */}
          {canManage && !isDecommissioned && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Change Status</h3>
              <div className="flex gap-2 items-center">
                <select value={newStatus} onChange={(e) => { setNewStatus(e.target.value); setConfirmDecomm(false) }} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5">
                  <option value="">Select new status…</option>
                  {statuses.filter((s) => s !== asset.status).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                  ))}
                </select>
                {newStatus && (
                  <button
                    onClick={handleStatusChange}
                    disabled={statusBusy}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-lg text-white disabled:opacity-60 ${newStatus === 'decommissioned' ? 'bg-danger hover:bg-red-700' : 'bg-navy-700 hover:bg-navy-800'}`}
                  >
                    {statusBusy ? 'Updating…' : newStatus === 'decommissioned' && !confirmDecomm ? 'Confirm Decommission?' : 'Update Status'}
                  </button>
                )}
              </div>
              {confirmDecomm && (
                <p className="text-xs text-danger mt-2">⚠ This cannot be undone. All assigned gear will be unassigned. Click again to confirm.</p>
              )}
              {statusError && <p className="text-xs text-danger mt-2">{statusError}</p>}
            </div>
          )}

          {/* Gear Assignment */}
          {isGear && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Assignment</h3>
              {(asset.assignedToStaffName || asset.assignedToApparatusName) ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Assigned to: {asset.assignedToStaffName ?? asset.assignedToApparatusName}
                    </p>
                    <p className="text-xs text-gray-500">{asset.assignedToStaffId ? 'Staff member' : 'Apparatus'}</p>
                  </div>
                  {canManage && !isDecommissioned && (
                    <button
                      onClick={handleUnassign}
                      disabled={assignBusy}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                    >
                      {assignBusy ? 'Unassigning…' : 'Unassign'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-3">Not currently assigned.</p>
              )}

              {canManage && !isDecommissioned && asset.status !== 'expired' && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex gap-2 mb-3">
                    {(['staff', 'apparatus'] as const).map((m) => (
                      <button key={m} onClick={() => setAssignMode(m)} className={`px-3 py-1 text-xs font-medium rounded-lg border ${assignMode === m ? 'bg-navy-700 text-white border-navy-700' : 'border-gray-300 text-gray-600'}`}>
                        {m === 'staff' ? 'Assign to Staff' : 'Assign to Apparatus'}
                      </button>
                    ))}
                  </div>
                  {assignMode === 'staff' ? (
                    <div className="flex gap-2">
                      <select value={assignStaffId} onChange={(e) => setAssignStaffId(e.target.value)} className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5">
                        <option value="">Select staff member…</option>
                        {(staffList as StaffMember[]).filter((m) => m.role !== 'owner' || true).map((m) => (
                          <option key={m.memberId} value={m.userId}>{m.displayName}</option>
                        ))}
                      </select>
                      <button onClick={handleAssign} disabled={assignBusy || !assignStaffId} className="px-4 py-1.5 bg-navy-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 hover:bg-navy-800">
                        {assignBusy ? '…' : 'Assign'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter apparatus asset ID…"
                        value={assignApparatusId}
                        onChange={(e) => setAssignApparatusId(e.target.value)}
                        className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5"
                      />
                      <button onClick={handleAssign} disabled={assignBusy || !assignApparatusId} className="px-4 py-1.5 bg-navy-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 hover:bg-navy-800">
                        {assignBusy ? '…' : 'Assign'}
                      </button>
                    </div>
                  )}
                  {assignError && <p className="text-xs text-danger mt-2">{assignError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Log Inspection */}
          {(canManage || isGear) && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Log Inspection</h3>
              <form onSubmit={handleLogInspection} className="space-y-3">
                <div className="flex gap-4">
                  {(['pass', 'fail'] as const).map((r) => (
                    <label key={r} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="result" value={r} checked={inspResult === r} onChange={() => setInspResult(r)} className="accent-navy-700" />
                      <span className={`text-sm font-medium ${r === 'pass' ? 'text-success' : 'text-danger'}`}>{r === 'pass' ? 'Pass' : 'Fail'}</span>
                    </label>
                  ))}
                </div>
                <input type="date" value={inspDate} onChange={(e) => setInspDate(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-48" placeholder="Today" />
                <textarea value={inspNotes} onChange={(e) => setInspNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Notes (optional)…" />
                {inspError && <p className="text-xs text-danger">{inspError}</p>}
                <button type="submit" disabled={inspBusy} className="px-4 py-2 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 disabled:opacity-60">
                  {inspBusy ? 'Logging…' : 'Log Inspection'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Tab: Inspections */}
      {activeTab === 'inspections' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {inspections.length === 0 && inspLoaded ? (
            <div className="py-16 text-center">
              <p className="text-gray-500 text-sm">No inspections recorded yet.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Inspector</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Result</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inspections.map((insp) => (
                    <tr key={insp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{insp.inspectionDate}</td>
                      <td className="px-4 py-3 text-gray-600">{insp.inspectorName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase ${insp.result === 'pass' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`} style={{ fontFamily: 'var(--font-condensed)' }}>
                          {insp.result}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{insp.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inspTotal > LIMIT && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <span className="text-sm text-gray-500">Showing {inspOffset + 1}–{Math.min(inspOffset + inspections.length, inspTotal)} of {inspTotal}</span>
                  <div className="flex gap-2">
                    <button disabled={inspOffset === 0} onClick={() => loadInspections(Math.max(0, inspOffset - LIMIT))} className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-40">Previous</button>
                    <button disabled={inspOffset + inspections.length >= inspTotal} onClick={() => loadInspections(inspOffset + LIMIT)} className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Audit Log */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {auditEntries.length === 0 && auditLoaded ? (
            <div className="py-16 text-center">
              <p className="text-gray-500 text-sm">No audit log entries yet.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Actor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auditEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500">{entry.createdAt.slice(0, 19).replace('T', ' ')}</td>
                      <td className="px-4 py-3 text-gray-600">{entry.actorName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{entry.action}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {entry.detailJson ? JSON.stringify(entry.detailJson) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditTotal > LIMIT && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <span className="text-sm text-gray-500">Showing {auditOffset + 1}–{Math.min(auditOffset + auditEntries.length, auditTotal)} of {auditTotal}</span>
                  <div className="flex gap-2">
                    <button disabled={auditOffset === 0} onClick={() => loadAudit(Math.max(0, auditOffset - LIMIT))} className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-40">Previous</button>
                    <button disabled={auditOffset + auditEntries.length >= auditTotal} onClick={() => loadAudit(auditOffset + LIMIT)} className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-navy-700 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>Edit Asset</h3>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} required maxLength={200} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
                  <input type="text" value={editMake} onChange={(e) => setEditMake(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                  <input type="text" value={editModel} onChange={(e) => setEditModel(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                <input type="text" value={editSerial} onChange={(e) => setEditSerial(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
                <input type="date" value={editExpiration} onChange={(e) => setEditExpiration(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
              </div>
              {editError && <p className="text-sm text-danger">{editError}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={editBusy} className="flex-1 py-2 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 disabled:opacity-60">
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setShowEdit(false)} className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
