import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle, XCircle, Clock, Edit2, AlertTriangle } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { AssetDetailView, AssetView, InspectionView, AssetAuditEntry } from '@/lib/asset.types'
import {
  getAssetServerFn,
  assignGearServerFn,
  unassignGearServerFn,
  logInspectionServerFn,
  changeAssetStatusServerFn,
  updateAssetServerFn,
  setInspectionIntervalServerFn,
  getInspectionHistoryServerFn,
  getAssetAuditLogServerFn,
  listAssetsServerFn,
} from '@/server/assets'
import { listStaffServerFn } from '@/server/staff'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets/$assetId')({
  head: () => ({
    meta: [{ title: 'Asset Detail | Scene Ready' }],
  }),
  loader: async ({ params }) => {
    const assetResult = await getAssetServerFn({ data: { orgSlug: params.orgSlug, assetId: params.assetId } })
    if (!assetResult.success) return { asset: null, staffList: [], apparatusList: [] }

    const [staffResult, apparatusResult] = await Promise.all([
      listStaffServerFn({ data: { orgSlug: params.orgSlug } }),
      listAssetsServerFn({ data: { orgSlug: params.orgSlug, assetType: 'apparatus', limit: 200 } }),
    ])

    return {
      asset: assetResult.asset,
      staffList: staffResult.success ? staffResult.members : [],
      apparatusList: apparatusResult.success ? apparatusResult.assets : [],
    }
  },
  component: AssetDetailPage,
})

const APPARATUS_STATUSES = [
  { value: 'in_service', label: 'In Service' },
  { value: 'out_of_service', label: 'Out of Service' },
  { value: 'reserve', label: 'Reserve' },
  { value: 'decommissioned', label: 'Decommissioned' },
]

const GEAR_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'out_of_service', label: 'Out of Service' },
  { value: 'decommissioned', label: 'Decommissioned' },
  { value: 'expired', label: 'Expired' },
]

const APPARATUS_CATEGORIES = [
  { value: 'engine', label: 'Engine' },
  { value: 'ladder_truck', label: 'Ladder Truck' },
  { value: 'ambulance_medic', label: 'Ambulance/Medic' },
  { value: 'battalion_chief', label: 'Battalion Chief' },
  { value: 'rescue', label: 'Rescue' },
  { value: 'brush_wildland', label: 'Brush/Wildland' },
  { value: 'tanker_tender', label: 'Tanker/Tender' },
  { value: 'boat', label: 'Boat' },
  { value: 'atv_utv', label: 'ATV/UTV' },
  { value: 'command_vehicle', label: 'Command Vehicle' },
  { value: 'utility', label: 'Utility' },
  { value: 'other', label: 'Other' },
]

const GEAR_CATEGORIES = [
  { value: 'scba', label: 'SCBA' },
  { value: 'ppe', label: 'PPE' },
  { value: 'radio', label: 'Radio' },
  { value: 'medical_equipment', label: 'Medical Equipment' },
  { value: 'tools', label: 'Tools' },
  { value: 'hose', label: 'Hose' },
  { value: 'nozzle', label: 'Nozzle' },
  { value: 'thermal_camera', label: 'Thermal Camera' },
  { value: 'gas_detector', label: 'Gas Detector' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'extrication', label: 'Extrication' },
  { value: 'rope_rescue', label: 'Rope Rescue' },
  { value: 'water_rescue', label: 'Water Rescue' },
  { value: 'hazmat', label: 'HazMat' },
  { value: 'other', label: 'Other' },
]

const INSPECTION_PRESETS = [
  { label: 'None', value: null },
  { label: 'Daily', value: 1 },
  { label: 'Weekly', value: 7 },
  { label: 'Monthly', value: 30 },
  { label: 'Quarterly', value: 90 },
  { label: 'Semi-Annual', value: 182 },
  { label: 'Annual', value: 365 },
]

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

function statusBadgeClass(status: string): string {
  if (status === 'in_service' || status === 'available') return 'bg-success-bg text-success'
  if (status === 'out_of_service') return 'bg-warning-bg text-warning'
  if (status === 'decommissioned' || status === 'expired') return 'bg-gray-100 text-gray-500'
  if (status === 'assigned') return 'bg-blue-50 text-blue-700'
  return 'bg-gray-100 text-gray-600'
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(status)}`}
      style={{ fontFamily: 'var(--font-condensed)' }}
    >
      {label}
    </span>
  )
}

type StaffMember = { id: string; name: string; email: string | null; status: string; userId: string | null; role: string; phone: string | null; addedAt: string }

function AssetDetailPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { asset: initialAsset, staffList, apparatusList } = Route.useLoaderData()

  const [asset, setAsset] = useState<AssetDetailView | null>(initialAsset)
  const [activeTab, setActiveTab] = useState<'details' | 'inspections' | 'audit'>('details')

  // Inspection form
  const [inspResult, setInspResult] = useState<'pass' | 'fail'>('pass')
  const [inspNotes, setInspNotes] = useState('')
  const [inspDate, setInspDate] = useState('')
  const [inspBusy, setInspBusy] = useState(false)
  const [inspError, setInspError] = useState<string | null>(null)
  const [recentInspections, setRecentInspections] = useState<InspectionView[]>([])
  const [inspLoaded, setInspLoaded] = useState(false)

  // Assignment form
  const [assignTarget, setAssignTarget] = useState<'staff' | 'apparatus'>('staff')
  const [assignStaffId, setAssignStaffId] = useState('')
  const [assignAppId, setAssignAppId] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [confirmUnassign, setConfirmUnassign] = useState(false)
  const [unassignBusy, setUnassignBusy] = useState(false)

  // Status change
  const [newStatus, setNewStatus] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [confirmDecommission, setConfirmDecommission] = useState(false)

  // Edit form
  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editSerial, setEditSerial] = useState('')
  const [editMake, setEditMake] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editExpiration, setEditExpiration] = useState('')
  const [editUnitNumber, setEditUnitNumber] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Inspection interval
  const [intervalDays, setIntervalDays] = useState<number | null>(null)
  const [intervalBusy, setIntervalBusy] = useState(false)
  const [intervalError, setIntervalError] = useState<string | null>(null)

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AssetAuditEntry[]>([])
  const [auditLoaded, setAuditLoaded] = useState(false)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditOffset, setAuditOffset] = useState(0)

  // Inspection history
  const [inspHistory, setInspHistory] = useState<InspectionView[]>([])
  const [inspHistoryLoaded, setInspHistoryLoaded] = useState(false)
  const [inspHistoryTotal, setInspHistoryTotal] = useState(0)
  const [inspHistoryOffset, setInspHistoryOffset] = useState(0)

  const canManage = canDo(userRole, 'manage-assets')

  if (!asset) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-400 text-sm">Asset not found.</p>
        <Link to="/orgs/$orgSlug/assets" params={{ orgSlug: org.slug }} className="mt-3 inline-block text-sm text-navy-700 hover:underline">
          Back to Assets
        </Link>
      </div>
    )
  }

  const isDecommissioned = asset.status === 'decommissioned'
  const statuses = asset.assetType === 'apparatus' ? APPARATUS_STATUSES : GEAR_STATUSES
  const categories = asset.assetType === 'apparatus' ? APPARATUS_CATEGORIES : GEAR_CATEGORIES
  const activeStaff = (staffList as StaffMember[]).filter((s) => s.status === 'active' || s.status === 'roster_only' || s.status === 'pending')

  async function refreshAsset() {
    const r = await getAssetServerFn({ data: { orgSlug: org.slug, assetId: asset!.id } })
    if (r.success) setAsset(r.asset)
  }

  // --- Inspection ---
  async function handleLogInspection(e: React.FormEvent) {
    e.preventDefault()
    setInspError(null)
    setInspBusy(true)
    try {
      const r = await logInspectionServerFn({
        data: {
          orgSlug: org.slug,
          assetId: asset!.id,
          result: inspResult,
          notes: inspNotes.trim() || undefined,
          inspectionDate: inspDate || undefined,
        },
      })
      if (!r.success) { setInspError('Failed to log inspection.'); return }
      setInspNotes('')
      setInspDate('')
      setRecentInspections((prev) => [r.inspection, ...prev.slice(0, 4)])
      await refreshAsset()
    } finally {
      setInspBusy(false)
    }
  }

  async function loadInspections(offset = 0) {
    const r = await getInspectionHistoryServerFn({
      data: { orgSlug: org.slug, assetId: asset!.id, limit: 50, offset },
    })
    if (r.success) {
      setInspHistory(r.inspections)
      setInspHistoryTotal(r.total)
      setInspHistoryOffset(offset)
      setInspHistoryLoaded(true)
    }
  }

  async function loadAudit(offset = 0) {
    const r = await getAssetAuditLogServerFn({
      data: { orgSlug: org.slug, assetId: asset!.id, limit: 50, offset },
    })
    if (r.success) {
      setAuditEntries(r.entries)
      setAuditTotal(r.total)
      setAuditOffset(offset)
      setAuditLoaded(true)
    }
  }

  async function handleTabChange(tab: 'details' | 'inspections' | 'audit') {
    setActiveTab(tab)
    if (tab === 'inspections' && !inspHistoryLoaded) await loadInspections()
    if (tab === 'audit' && !auditLoaded) await loadAudit()
  }

  async function loadRecentInspections() {
    if (inspLoaded) return
    const r = await getInspectionHistoryServerFn({
      data: { orgSlug: org.slug, assetId: asset!.id, limit: 5 },
    })
    if (r.success) {
      setRecentInspections(r.inspections)
      setInspLoaded(true)
    }
  }

  // --- Assignment ---
  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    setAssignError(null)
    const staffId = assignTarget === 'staff' ? assignStaffId : undefined
    const appId = assignTarget === 'apparatus' ? assignAppId : undefined
    if (!staffId && !appId) { setAssignError('Select a target.'); return }
    setAssignBusy(true)
    try {
      const r = await assignGearServerFn({
        data: {
          orgSlug: org.slug,
          assetId: asset!.id,
          assignToStaffId: staffId,
          assignToApparatusId: appId,
        },
      })
      if (!r.success) {
        setAssignError(r.error === 'INVALID_TARGET' ? 'Target not found.' : 'Failed to assign gear.')
        return
      }
      setAssignStaffId('')
      setAssignAppId('')
      await refreshAsset()
    } finally {
      setAssignBusy(false)
    }
  }

  async function handleUnassign() {
    setConfirmUnassign(false)
    setUnassignBusy(true)
    try {
      const r = await unassignGearServerFn({ data: { orgSlug: org.slug, assetId: asset!.id } })
      if (r.success) await refreshAsset()
    } finally {
      setUnassignBusy(false)
    }
  }

  // --- Status change ---
  async function handleStatusChange() {
    if (!newStatus || newStatus === asset!.status) return
    if (newStatus === 'decommissioned' && !confirmDecommission) {
      setConfirmDecommission(true)
      return
    }
    setConfirmDecommission(false)
    setStatusBusy(true)
    setStatusError(null)
    try {
      const r = await changeAssetStatusServerFn({ data: { orgSlug: org.slug, assetId: asset!.id, newStatus } })
      if (!r.success) { setStatusError('Failed to change status.'); return }
      setNewStatus('')
      await refreshAsset()
    } finally {
      setStatusBusy(false)
    }
  }

  // --- Edit ---
  function openEdit() {
    setEditName(asset!.name)
    setEditCategory(asset!.category)
    setEditSerial(asset!.serialNumber ?? '')
    setEditMake(asset!.make ?? '')
    setEditModel(asset!.model ?? '')
    setEditNotes(asset!.notes ?? '')
    setEditExpiration(asset!.expirationDate ?? '')
    setEditUnitNumber(asset!.unitNumber ?? '')
    setEditError(null)
    setShowEdit(true)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    setEditError(null)
    setEditBusy(true)
    try {
      const r = await updateAssetServerFn({
        data: {
          orgSlug: org.slug,
          assetId: asset!.id,
          name: editName.trim(),
          category: editCategory,
          serialNumber: editSerial.trim() || null,
          make: editMake.trim() || null,
          model: editModel.trim() || null,
          notes: editNotes.trim() || null,
          expirationDate: editExpiration || null,
          unitNumber: asset!.assetType === 'apparatus' ? editUnitNumber.trim() : undefined,
        },
      })
      if (!r.success) {
        if (r.error === 'DUPLICATE_UNIT_NUMBER') setEditError('Unit number already in use.')
        else if (r.error === 'DUPLICATE_SERIAL_NUMBER') setEditError('Serial number already in use.')
        else setEditError('Failed to update asset.')
        return
      }
      setShowEdit(false)
      await refreshAsset()
    } finally {
      setEditBusy(false)
    }
  }

  // --- Inspection interval ---
  async function handleSetInterval(days: number | null) {
    setIntervalError(null)
    setIntervalBusy(true)
    try {
      const r = await setInspectionIntervalServerFn({ data: { orgSlug: org.slug, assetId: asset!.id, intervalDays: days } })
      if (!r.success) { setIntervalError('Failed to set interval.'); return }
      setIntervalDays(days)
      await refreshAsset()
    } finally {
      setIntervalBusy(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  const currentIntervalDays = intervalDays ?? asset.inspectionIntervalDays

  return (
    <div className="max-w-4xl">
      {/* Back */}
      <Link
        to="/orgs/$orgSlug/assets"
        params={{ orgSlug: org.slug }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Assets
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-sans)' }}>
              {asset.name}
            </h1>
            <StatusBadge status={asset.status} />
            <span className="text-xs text-gray-400 capitalize">{asset.assetType}</span>
          </div>
          {asset.unitNumber && (
            <p className="text-sm text-gray-500 mt-0.5 font-mono">Unit: {asset.unitNumber}</p>
          )}
        </div>
        {canManage && !isDecommissioned && (
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['details', 'inspections', 'audit'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => void handleTabChange(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab ? 'border-red-700 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab: Details */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Core info */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>
              Asset Details
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Category</dt><dd className="font-medium text-gray-800">{CATEGORY_LABELS[asset.category] ?? asset.category}</dd></div>
              {asset.make && <div className="flex justify-between"><dt className="text-gray-500">Make</dt><dd className="font-medium text-gray-800">{asset.make}</dd></div>}
              {asset.model && <div className="flex justify-between"><dt className="text-gray-500">Model</dt><dd className="font-medium text-gray-800">{asset.model}</dd></div>}
              {asset.serialNumber && <div className="flex justify-between"><dt className="text-gray-500">Serial</dt><dd className="font-medium font-mono text-gray-800">{asset.serialNumber}</dd></div>}
              {asset.manufactureDate && <div className="flex justify-between"><dt className="text-gray-500">Manufactured</dt><dd className="font-medium text-gray-800">{asset.manufactureDate}</dd></div>}
              {asset.purchasedDate && <div className="flex justify-between"><dt className="text-gray-500">Purchased</dt><dd className="font-medium text-gray-800">{asset.purchasedDate}</dd></div>}
              {asset.inServiceDate && <div className="flex justify-between"><dt className="text-gray-500">In Service</dt><dd className="font-medium text-gray-800">{asset.inServiceDate}</dd></div>}
              {asset.expirationDate && <div className="flex justify-between"><dt className="text-gray-500">Expiration</dt><dd className="font-medium text-gray-800">{asset.expirationDate}</dd></div>}
              {asset.warrantyExpirationDate && <div className="flex justify-between"><dt className="text-gray-500">Warranty Exp.</dt><dd className="font-medium text-gray-800">{asset.warrantyExpirationDate}</dd></div>}
            </dl>
            {asset.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700">{asset.notes}</p>
              </div>
            )}
            {asset.customFields && Object.keys(asset.customFields).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Custom Fields</p>
                <dl className="space-y-1">
                  {Object.entries(asset.customFields).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <dt className="text-gray-500 capitalize">{k}</dt>
                      <dd className="font-medium text-gray-800">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          {/* Inspection schedule + status change */}
          <div className="space-y-4">
            {/* Inspection schedule */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>
                <Clock className="w-3.5 h-3.5 inline mr-1.5" />
                Inspection Schedule
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Interval</span>
                  <span className="font-medium text-gray-800">
                    {currentIntervalDays ? `${currentIntervalDays} days` : 'Not set'}
                  </span>
                </div>
                {asset.nextInspectionDue && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Next Due</span>
                    <span className={`font-medium ${new Date(asset.nextInspectionDue) < new Date() ? 'text-danger' : 'text-gray-800'}`}>
                      {asset.nextInspectionDue}
                    </span>
                  </div>
                )}
              </div>
              {canManage && !isDecommissioned && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <label className="block text-xs text-gray-500 mb-2">Set interval</label>
                  <div className="flex flex-wrap gap-1.5">
                    {INSPECTION_PRESETS.map((p) => (
                      <button
                        key={String(p.value)}
                        type="button"
                        disabled={intervalBusy}
                        onClick={() => void handleSetInterval(p.value)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                          currentIntervalDays === p.value
                            ? 'border-navy-700 bg-navy-700 text-white'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {intervalError && <p className="text-danger text-xs mt-2">{intervalError}</p>}
                </div>
              )}
            </div>

            {/* Status change */}
            {canManage && !isDecommissioned && (
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Change Status
                </h3>
                <div className="flex gap-2">
                  <select
                    value={newStatus}
                    onChange={(e) => { setNewStatus(e.target.value); setConfirmDecommission(false) }}
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy-600"
                  >
                    <option value="">Select status…</option>
                    {statuses.filter((s) => s.value !== asset.status).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!newStatus || statusBusy}
                    onClick={() => void handleStatusChange()}
                    className="px-4 py-2 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 disabled:opacity-50 transition-colors"
                  >
                    {statusBusy ? '…' : 'Change'}
                  </button>
                </div>
                {newStatus === 'decommissioned' && confirmDecommission && (
                  <div className="mt-3 p-3 bg-danger-bg border border-red-200 rounded-lg text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                      <div>
                        <p className="text-danger font-medium">This cannot be undone.</p>
                        {asset.assetType === 'apparatus' && (
                          <p className="text-gray-600 text-xs mt-0.5">All assigned gear will be unassigned.</p>
                        )}
                        <button
                          type="button"
                          disabled={statusBusy}
                          onClick={() => void handleStatusChange()}
                          className="mt-2 px-3 py-1.5 bg-danger text-white text-xs font-semibold rounded hover:bg-red-800 disabled:opacity-50 transition-colors"
                        >
                          Confirm Decommission
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {statusError && <p className="text-danger text-xs mt-2">{statusError}</p>}
              </div>
            )}

            {/* Gear assignment */}
            {asset.assetType === 'gear' && canManage && !isDecommissioned && (
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>
                  Assignment
                </h3>
                {(asset.assignedToStaffName || asset.assignedToApparatusName) ? (
                  <div className="mb-3">
                    <p className="text-sm text-gray-600">
                      Assigned to: <span className="font-medium text-gray-800">
                        {asset.assignedToStaffName ?? asset.assignedToApparatusName}
                      </span>
                    </p>
                    {!confirmUnassign ? (
                      <button
                        type="button"
                        onClick={() => setConfirmUnassign(true)}
                        className="mt-2 text-sm text-gray-500 hover:text-danger transition-colors"
                      >
                        Unassign
                      </button>
                    ) : (
                      <div className="mt-2 flex gap-2 items-center">
                        <span className="text-sm text-gray-600">Confirm unassign?</span>
                        <button
                          type="button"
                          disabled={unassignBusy}
                          onClick={() => void handleUnassign()}
                          className="px-3 py-1 text-xs bg-danger text-white rounded hover:bg-red-800 disabled:opacity-50 transition-colors"
                        >
                          {unassignBusy ? '…' : 'Unassign'}
                        </button>
                        <button type="button" onClick={() => setConfirmUnassign(false)} className="text-xs text-gray-500">Cancel</button>
                      </div>
                    )}
                  </div>
                ) : null}
                <form onSubmit={(e) => void handleAssign(e)} className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignTarget('staff')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded border transition-colors ${assignTarget === 'staff' ? 'border-navy-700 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-500'}`}
                    >
                      To Staff
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignTarget('apparatus')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded border transition-colors ${assignTarget === 'apparatus' ? 'border-navy-700 bg-navy-50 text-navy-700' : 'border-gray-200 text-gray-500'}`}
                    >
                      To Apparatus
                    </button>
                  </div>
                  {assignTarget === 'staff' ? (
                    <select
                      value={assignStaffId}
                      onChange={(e) => setAssignStaffId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Select staff member…</option>
                      {activeStaff.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={assignAppId}
                      onChange={(e) => setAssignAppId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Select apparatus…</option>
                      {(apparatusList as AssetView[]).filter((a) => a.status !== 'decommissioned').map((a) => (
                        <option key={a.id} value={a.id}>{a.name} ({a.unitNumber})</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="submit"
                    disabled={assignBusy}
                    className="w-full py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
                  >
                    {assignBusy ? 'Assigning…' : 'Assign'}
                  </button>
                  {assignError && <p className="text-danger text-xs">{assignError}</p>}
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Inspections */}
      {activeTab === 'inspections' && (
        <div className="space-y-6">
          {/* Log inspection form */}
          {(canManage || (asset.assetType === 'gear' && asset.assignedToStaffId)) && !isDecommissioned && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>
                Log Inspection
              </h3>
              <form onSubmit={(e) => void handleLogInspection(e)} className="space-y-4">
                <div>
                  <label className={labelCls}>Result</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setInspResult('pass')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors ${inspResult === 'pass' ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >
                      <CheckCircle className="w-4 h-4" /> Pass
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspResult('fail')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors ${inspResult === 'fail' ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >
                      <XCircle className="w-4 h-4" /> Fail
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    value={inspDate}
                    onChange={(e) => setInspDate(e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-xs text-gray-400 mt-1">Defaults to today if left blank.</p>
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea
                    value={inspNotes}
                    onChange={(e) => setInspNotes(e.target.value)}
                    placeholder="Optional…"
                    rows={2}
                    className={`${inputCls} resize-none`}
                  />
                </div>
                {inspError && <p className="text-danger text-xs">{inspError}</p>}
                <button
                  type="submit"
                  disabled={inspBusy}
                  className="w-full py-2.5 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {inspBusy ? 'Logging…' : 'Log Inspection'}
                </button>
              </form>
            </div>
          )}

          {/* Inspection history */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Inspection History</h3>
              {!inspHistoryLoaded && (
                <button type="button" onClick={() => void loadInspections()} className="text-xs text-navy-700 hover:underline">
                  Load
                </button>
              )}
            </div>
            {inspHistoryLoaded ? (
              inspHistory.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">No inspections recorded.</div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Date</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Result</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Inspector</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {inspHistory.map((i) => (
                        <tr key={i.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">{i.inspectionDate}</td>
                          <td className="px-4 py-3">
                            {i.result === 'pass' ? (
                              <span className="inline-flex items-center gap-1 text-green-700 font-medium text-xs"><CheckCircle className="w-3.5 h-3.5" /> Pass</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-danger font-medium text-xs"><XCircle className="w-3.5 h-3.5" /> Fail</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{i.inspectorName}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{i.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {inspHistoryTotal > 50 && (
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <span>{inspHistoryOffset + 1}–{Math.min(inspHistoryOffset + 50, inspHistoryTotal)} of {inspHistoryTotal}</span>
                      <div className="flex gap-2">
                        {inspHistoryOffset > 0 && <button type="button" onClick={() => void loadInspections(inspHistoryOffset - 50)} className="px-3 py-1 border rounded hover:bg-gray-50">Prev</button>}
                        {inspHistoryOffset + 50 < inspHistoryTotal && <button type="button" onClick={() => void loadInspections(inspHistoryOffset + 50)} className="px-3 py-1 border rounded hover:bg-gray-50">Next</button>}
                      </div>
                    </div>
                  )}
                </>
              )
            ) : (
              <div className="py-10 text-center text-sm text-gray-400">Click "Load" to view inspection history.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Audit */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Audit Log</h3>
            {!auditLoaded && (
              <button type="button" onClick={() => void loadAudit()} className="text-xs text-navy-700 hover:underline">
                Load
              </button>
            )}
          </div>
          {auditLoaded ? (
            auditEntries.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No audit entries.</div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Date</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Action</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Actor</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-700">{e.action}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{e.actorName ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {e.detailJson ? (
                            <span>{JSON.stringify(e.detailJson)}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {auditTotal > 50 && (
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span>{auditOffset + 1}–{Math.min(auditOffset + 50, auditTotal)} of {auditTotal}</span>
                    <div className="flex gap-2">
                      {auditOffset > 0 && <button type="button" onClick={() => void loadAudit(auditOffset - 50)} className="px-3 py-1 border rounded hover:bg-gray-50">Prev</button>}
                      {auditOffset + 50 < auditTotal && <button type="button" onClick={() => void loadAudit(auditOffset + 50)} className="px-3 py-1 border rounded hover:bg-gray-50">Next</button>}
                    </div>
                  </div>
                )}
              </>
            )
          ) : (
            <div className="py-10 text-center text-sm text-gray-400">Click "Load" to view audit log.</div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-navy-700 mb-4">Edit Asset</h2>
            <form onSubmit={(e) => void handleEdit(e)} className="space-y-4">
              <div>
                <label className={labelCls}>Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={200} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className={inputCls} required>
                  {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              {asset.assetType === 'apparatus' && (
                <div>
                  <label className={labelCls}>Unit Number</label>
                  <input type="text" value={editUnitNumber} onChange={(e) => setEditUnitNumber(e.target.value)} className={inputCls} required />
                </div>
              )}
              <div>
                <label className={labelCls}>Serial Number</label>
                <input type="text" value={editSerial} onChange={(e) => setEditSerial(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Make</label>
                  <input type="text" value={editMake} onChange={(e) => setEditMake(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Model</label>
                  <input type="text" value={editModel} onChange={(e) => setEditModel(e.target.value)} className={inputCls} />
                </div>
              </div>
              {asset.assetType === 'gear' && (
                <div>
                  <label className={labelCls}>Expiration Date</label>
                  <input type="date" value={editExpiration} onChange={(e) => setEditExpiration(e.target.value)} className={inputCls} />
                </div>
              )}
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
              </div>
              {editError && <p className="text-danger text-sm">{editError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editBusy} className="flex-1 py-2.5 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors">
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setShowEdit(false)} className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recent inspections side panel (on details tab, lazy loaded) */}
      {activeTab === 'details' && !inspLoaded && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => void loadRecentInspections()}
            className="text-sm text-navy-700 hover:underline"
          >
            Show recent inspections
          </button>
        </div>
      )}
      {activeTab === 'details' && inspLoaded && recentInspections.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>
            Recent Inspections
          </h3>
          <div className="space-y-2">
            {recentInspections.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {i.result === 'pass' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-danger" />}
                  <span className="text-gray-600">{i.inspectionDate}</span>
                  {i.notes && <span className="text-gray-400 text-xs">— {i.notes}</span>}
                </div>
                <span className="text-gray-400 text-xs">{i.inspectorName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
