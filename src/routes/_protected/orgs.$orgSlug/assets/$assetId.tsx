import { useState } from 'react'
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { canDo } from '@/lib/rbac'
import type {
  AssetDetailView,
  InspectionScheduleView,
  AssetAuditEntry,
  AssetView,
  RecurrenceFreq,
  RecurrenceRule,
} from '@/lib/asset.types'
import {
  APPARATUS_STATUSES,
  GEAR_STATUSES,
} from '@/lib/asset.types'
import type { FormFieldDefinition, LinkedEntityType } from '@/lib/form.types'
import {
  getAssetServerFn,
  assignGearServerFn,
  unassignGearServerFn,
  getAssetAuditLogServerFn,
  changeAssetStatusServerFn,
  updateAssetServerFn,
  addInspectionScheduleServerFn,
  updateInspectionScheduleServerFn,
  deleteInspectionScheduleServerFn,
  getInspectionSchedulesServerFn,
} from '@/server/assets'
import { listStaffServerFn } from '@/server/staff'
import { listFormTemplatesServerFn, getFormTemplateServerFn, submitFormServerFn, listSubmissionsServerFn } from '@/server/forms'
import { FormRenderer, type FormValues, type FormErrors } from '@/components/form-renderer/FormRenderer'
import type { FormSubmissionView } from '@/lib/form.types'

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

const FREQ_OPTIONS: { label: string; value: RecurrenceFreq }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Semi-Annual', value: 'semi_annual' },
  { label: 'Annual', value: 'annual' },
]

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function describeRule(rule: RecurrenceRule): string {
  const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
  }
  switch (rule.freq) {
    case 'daily': return 'Daily'
    case 'weekly': return `Weekly on ${dow[rule.dayOfWeek ?? 5]}`
    case 'monthly': return rule.dayOfMonth ? `Monthly on the ${ordinal(rule.dayOfMonth)}` : 'Monthly'
    case 'quarterly': return rule.dayOfMonth ? `Quarterly on the ${ordinal(rule.dayOfMonth)}` : 'Quarterly'
    case 'semi_annual': return rule.dayOfMonth ? `Semi-annually on the ${ordinal(rule.dayOfMonth)}` : 'Semi-annually'
    case 'annual': return rule.dayOfMonth ? `Annually on the ${ordinal(rule.dayOfMonth)}` : 'Annually'
  }
}

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

  // Schedules state
  const [schedules, setSchedules] = useState<InspectionScheduleView[]>([])
  const [schedulesLoaded, setSchedulesLoaded] = useState(false)
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addTemplateId, setAddTemplateId] = useState('')
  const [addFreq, setAddFreq] = useState<RecurrenceFreq>('weekly')
  const [addDow, setAddDow] = useState(5)
  const [addDom, setAddDom] = useState(1)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [formTemplates, setFormTemplates] = useState<{ id: string; name: string }[]>([])
  const [formTemplatesLoaded, setFormTemplatesLoaded] = useState(false)
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null)
  const [deleteScheduleBusy, setDeleteScheduleBusy] = useState(false)

  // Inline inspection form state
  const [activeInspSchedule, setActiveInspSchedule] = useState<InspectionScheduleView | null>(null)
  const [inspFields, setInspFields] = useState<FormFieldDefinition[]>([])
  const [inspValues, setInspValues] = useState<FormValues>({})
  const [inspErrors, setInspErrors] = useState<FormErrors>({})
  const [inspSubmitting, setInspSubmitting] = useState(false)
  const [inspSubmitError, setInspSubmitError] = useState<string | null>(null)
  const [inspFormLoading, setInspFormLoading] = useState(false)

  // Inspections tab (form submissions)
  const [submissions, setSubmissions] = useState<FormSubmissionView[]>([])
  const [submissionsTotal, setSubmissionsTotal] = useState(0)
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false)
  const [submissionsOffset, setSubmissionsOffset] = useState(0)

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

  const canManage = canDo(userRole, 'manage-assets')
  const canSubmitForms = canDo(userRole, 'submit-forms')
  const LIMIT = 50

  if (!asset) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg py-16 text-center">
        <p className="text-gray-500 text-sm">Asset not found.</p>
      </div>
    )
  }

  // After the null guard above, asset is always defined for the rest of this render.
  // We assign to a const so closures (event handlers) can rely on the narrowed type.
  const currentAsset = asset

  const isDecommissioned = currentAsset.status === 'decommissioned'
  const isGear = currentAsset.assetType === 'gear'
  const statuses = isGear ? GEAR_STATUSES : APPARATUS_STATUSES

  async function handleAssign() {
    if (!isGear) return
    setAssignError(null)
    setAssignBusy(true)
    const result = await assignGearServerFn({
      data: {
        orgSlug: org.slug,
        assetId: currentAsset.id,
        assignToStaffId: assignMode === 'staff' ? assignStaffId || undefined : undefined,
        assignToApparatusId: assignMode === 'apparatus' ? assignApparatusId || undefined : undefined,
      },
    })
    setAssignBusy(false)
    if (!result.success) { setAssignError(result.error); return }
    setAsset((a) => a ? { ...a, ...result.asset } : a)
    setAssignStaffId('')
    setAssignApparatusId('')
  }

  async function handleUnassign() {
    setAssignBusy(true)
    const result = await unassignGearServerFn({ data: { orgSlug: org.slug, assetId: currentAsset.id } })
    setAssignBusy(false)
    if (result.success) setAsset((a) => a ? { ...a, ...result.asset } : a)
  }

  async function loadSchedules() {
    const result = await getInspectionSchedulesServerFn({ data: { orgSlug: org.slug, assetId: currentAsset.id } })
    if (result.success) {
      setSchedules(result.schedules)
      setSchedulesLoaded(true)
    }
  }

  async function loadFormTemplates() {
    if (formTemplatesLoaded) return
    const result = await listFormTemplatesServerFn({ data: { orgSlug: org.slug, category: 'equipment_inspection', status: 'published', includeSystem: true } })
    if (result.success) {
      setFormTemplates(result.templates.map((t) => ({ id: t.id, name: t.name })))
      setFormTemplatesLoaded(true)
    }
  }

  async function handleAddSchedule() {
    if (!addLabel.trim() || !addTemplateId) return
    setAddBusy(true)
    setAddError(null)
    const rule: RecurrenceRule = addFreq === 'weekly'
      ? { freq: 'weekly', dayOfWeek: addDow }
      : addFreq === 'daily'
        ? { freq: 'daily' }
        : { freq: addFreq, dayOfMonth: addDom }
    const result = await addInspectionScheduleServerFn({
      data: { orgSlug: org.slug, assetId: currentAsset.id, formTemplateId: addTemplateId, label: addLabel.trim(), recurrenceRule: rule },
    })
    setAddBusy(false)
    if (!result.success) { setAddError(result.error); return }
    setSchedules((prev) => [...prev, result.schedule])
    setShowAddSchedule(false)
    setAddLabel('')
    setAddTemplateId('')
    setAddFreq('weekly')
  }

  async function handleDeleteSchedule(scheduleId: string) {
    setDeleteScheduleBusy(true)
    const result = await deleteInspectionScheduleServerFn({ data: { orgSlug: org.slug, assetId: currentAsset.id, scheduleId } })
    setDeleteScheduleBusy(false)
    if (result.success) {
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId))
      setDeletingScheduleId(null)
    }
  }

  async function handleToggleActive(schedule: InspectionScheduleView) {
    const result = await updateInspectionScheduleServerFn({
      data: { orgSlug: org.slug, assetId: currentAsset.id, scheduleId: schedule.id, isActive: !schedule.isActive },
    })
    if (result.success) {
      setSchedules((prev) => prev.map((s) => s.id === schedule.id ? result.schedule : s))
    }
  }

  async function startInspection(schedule: InspectionScheduleView) {
    setInspFormLoading(true)
    setActiveInspSchedule(schedule)
    setInspValues({})
    setInspErrors({})
    setInspSubmitError(null)

    const result = await getFormTemplateServerFn({ data: { orgSlug: org.slug, templateId: schedule.formTemplateId } })
    setInspFormLoading(false)
    if (result.success) {
      setInspFields(result.currentVersion.fields)
    }
  }

  async function handleInspSubmit() {
    if (!activeInspSchedule) return
    setInspSubmitting(true)
    setInspSubmitError(null)
    setInspErrors({})

    const result = await submitFormServerFn({
      data: {
        orgSlug: org.slug,
        templateId: activeInspSchedule.formTemplateId,
        linkedEntityType: 'asset' as LinkedEntityType,
        linkedEntityId: currentAsset.id,
        scheduleId: activeInspSchedule.id,
        values: inspValues,
      },
    })

    setInspSubmitting(false)
    if (result.success) {
      setActiveInspSchedule(null)
      setInspFields([])
      setInspValues({})
      // Refresh schedules to update next due dates
      await loadSchedules()
      // Refresh submissions if loaded
      if (submissionsLoaded) await loadSubmissions(0)
    } else if (result.error === 'VALIDATION_ERROR' && result.validationErrors) {
      setInspErrors(result.validationErrors)
    } else {
      setInspSubmitError('Failed to submit inspection.')
    }
  }

  async function loadSubmissions(off = 0) {
    const result = await listSubmissionsServerFn({
      data: { orgSlug: org.slug, linkedEntityType: 'asset', linkedEntityId: currentAsset.id, limit: LIMIT, offset: off },
    })
    if (result.success) {
      setSubmissions(result.submissions)
      setSubmissionsTotal(result.total)
      setSubmissionsLoaded(true)
      setSubmissionsOffset(off)
    }
  }

  async function loadAudit(off = 0) {
    const result = await getAssetAuditLogServerFn({ data: { orgSlug: org.slug, assetId: currentAsset.id, limit: LIMIT, offset: off } })
    if (result.success) {
      setAuditEntries(result.entries)
      setAuditTotal(result.total)
      setAuditLoaded(true)
      setAuditOffset(off)
    }
  }

  async function handleTabChange(tab: 'details' | 'inspections' | 'audit') {
    setActiveTab(tab)
    if (tab === 'details' && !schedulesLoaded) await loadSchedules()
    if (tab === 'inspections' && !submissionsLoaded) await loadSubmissions()
    if (tab === 'audit' && !auditLoaded) await loadAudit()
  }

  async function handleStatusChange() {
    if (!newStatus) return
    if (newStatus === 'decommissioned' && !confirmDecomm) { setConfirmDecomm(true); return }
    setStatusBusy(true)
    const result = await changeAssetStatusServerFn({ data: { orgSlug: org.slug, assetId: currentAsset.id, newStatus } })
    setStatusBusy(false)
    if (!result.success) { setStatusError(result.error); return }
    setAsset((a) => a ? { ...a, ...(result.asset as AssetView), notes: a.notes, manufactureDate: a.manufactureDate, purchasedDate: a.purchasedDate, inServiceDate: a.inServiceDate, warrantyExpirationDate: a.warrantyExpirationDate, customFields: a.customFields } : a)
    setNewStatus('')
    setConfirmDecomm(false)
  }

  function openEdit() {
    setEditName(currentAsset.name)
    setEditNotes(currentAsset.notes ?? '')
    setEditMake(currentAsset.make ?? '')
    setEditModel(currentAsset.model ?? '')
    setEditSerial(currentAsset.serialNumber ?? '')
    setEditExpiration(currentAsset.expirationDate ?? '')
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
        assetId: currentAsset.id,
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
    const updated = await getAssetServerFn({ data: { orgSlug: org.slug, assetId: currentAsset.id } })
    if (updated.success) setAsset(updated.asset)
    setShowEdit(false)
  }

  // Load schedules on first details tab view
  if (activeTab === 'details' && !schedulesLoaded) {
    void loadSchedules()
  }

  const inputClass = 'w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-700'

  const today = orgToday(org.scheduleDayStart)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
                {currentAsset.name}
              </h2>
              {statusBadge(currentAsset.status)}
            </div>
            <div className="flex gap-4 mt-1 text-sm text-gray-500">
              <span>{currentAsset.assetType === 'apparatus' ? 'Apparatus' : 'Gear'}</span>
              <span>·</span>
              <span>{CATEGORY_LABELS[currentAsset.category] ?? currentAsset.category}</span>
              {currentAsset.unitNumber && <><span>·</span><span className="font-mono">{currentAsset.unitNumber}</span></>}
              {currentAsset.serialNumber && <><span>·</span><span className="font-mono text-xs">{currentAsset.serialNumber}</span></>}
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
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>Asset Info</h3>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Name" value={currentAsset.name} />
              <Field label="Category" value={CATEGORY_LABELS[currentAsset.category] ?? currentAsset.category} />
              <Field label="Status" value={STATUS_LABELS[currentAsset.status] ?? currentAsset.status} />
              {currentAsset.unitNumber && <Field label="Unit Number" value={currentAsset.unitNumber} />}
              <Field label="Make" value={currentAsset.make} />
              <Field label="Model" value={currentAsset.model} />
              <Field label="Serial Number" value={currentAsset.serialNumber} />
            </dl>
            {currentAsset.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-condensed)' }}>Notes</dt>
                <dd className="text-sm text-gray-900 whitespace-pre-line">{currentAsset.notes}</dd>
              </div>
            )}
          </div>

          {/* Lifecycle dates */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>Lifecycle</h3>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Manufactured" value={currentAsset.manufactureDate} />
              <Field label="Purchased" value={currentAsset.purchasedDate} />
              <Field label="In Service" value={currentAsset.inServiceDate} />
              <Field label="Expires" value={currentAsset.expirationDate} />
              <Field label="Warranty Expires" value={currentAsset.warrantyExpirationDate} />
            </dl>
          </div>

          {/* Custom fields */}
          {currentAsset.customFields && Object.keys(currentAsset.customFields).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4" style={{ fontFamily: 'var(--font-condensed)' }}>Custom Fields</h3>
              <dl className="grid grid-cols-2 gap-3">
                {Object.entries(currentAsset.customFields).map(([k, v]) => (
                  <Field key={k} label={k} value={String(v)} />
                ))}
              </dl>
            </div>
          )}

          {/* Inspection Schedules */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ fontFamily: 'var(--font-condensed)' }}>Inspection Schedules</h3>
              {canManage && !isDecommissioned && (
                <button
                  onClick={() => { setShowAddSchedule(true); void loadFormTemplates() }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-navy-700 text-white hover:bg-navy-800"
                >
                  Add Schedule
                </button>
              )}
            </div>

            {schedules.length === 0 && schedulesLoaded && !showAddSchedule && (
              <p className="text-sm text-gray-400">No inspection schedules configured.</p>
            )}

            {schedules.length > 0 && (
              <div className="space-y-3 mb-4">
                {schedules.map((sched) => {
                  const isOverdue = sched.nextInspectionDue ? sched.nextInspectionDue < today : false
                  const isDueToday = sched.nextInspectionDue === today
                  return (
                    <div key={sched.id} className={`border rounded-lg p-4 ${!sched.isActive ? 'bg-gray-50 border-gray-200 opacity-60' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{sched.label}</span>
                            {!sched.isActive && <span className="text-xs text-gray-400">(inactive)</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {sched.formTemplateName} · {describeRule(sched.recurrenceRule)}
                          </p>
                          {sched.nextInspectionDue && sched.isActive && (
                            <p className={`text-xs mt-1 ${isOverdue ? 'text-danger font-semibold' : isDueToday ? 'text-warning font-semibold' : 'text-gray-500'}`}>
                              Next due: {sched.nextInspectionDue}
                              {isOverdue && ' (OVERDUE)'}
                              {isDueToday && ' (due today)'}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {sched.isActive && (canManage || canSubmitForms || isGear) && (
                            <button
                              onClick={() => startInspection(sched)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-navy-700 text-white hover:bg-navy-800"
                            >
                              Start Inspection
                            </button>
                          )}
                          {canManage && (
                            <>
                              <button onClick={() => handleToggleActive(sched)} className="text-xs text-gray-500 hover:underline">
                                {sched.isActive ? 'Disable' : 'Enable'}
                              </button>
                              {deletingScheduleId === sched.id ? (
                                <span className="flex items-center gap-1 text-xs">
                                  <button onClick={() => handleDeleteSchedule(sched.id)} disabled={deleteScheduleBusy} className="text-danger font-semibold hover:underline disabled:opacity-60">
                                    {deleteScheduleBusy ? '…' : 'Confirm'}
                                  </button>
                                  <button onClick={() => setDeletingScheduleId(null)} className="text-gray-500 hover:underline">Cancel</button>
                                </span>
                              ) : (
                                <button onClick={() => setDeletingScheduleId(sched.id)} className="text-xs text-danger hover:underline">Delete</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add Schedule Form */}
            {showAddSchedule && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">New Inspection Schedule</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <input type="text" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} className={inputClass} placeholder="e.g. Weekly Visual Check" maxLength={200} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Form Template</label>
                  <select value={addTemplateId} onChange={(e) => setAddTemplateId(e.target.value)} className={inputClass}>
                    <option value="">Select a form template…</option>
                    {formTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {FREQ_OPTIONS.map((f) => (
                      <button key={f.value} onClick={() => setAddFreq(f.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${addFreq === f.value ? 'bg-navy-700 text-white border-navy-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                {addFreq === 'weekly' && (
                  <div className="flex gap-1 flex-wrap">
                    {DAYS_OF_WEEK.map((day, i) => (
                      <button key={i} onClick={() => setAddDow(i)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${addDow === i ? 'bg-navy-700 text-white border-navy-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                        {day}
                      </button>
                    ))}
                  </div>
                )}
                {addFreq !== 'daily' && addFreq !== 'weekly' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">On the</span>
                    <select value={addDom} onChange={(e) => setAddDom(Number(e.target.value))} className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-navy-700">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <span className="text-sm text-gray-600">of the {FREQ_OPTIONS.find(f => f.value === addFreq)?.label.toLowerCase()}</span>
                  </div>
                )}
                {addError && <p className="text-xs text-danger">{addError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => void handleAddSchedule()} disabled={addBusy || !addLabel.trim() || !addTemplateId}
                    className="px-4 py-2 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 disabled:opacity-60">
                    {addBusy ? 'Adding…' : 'Add Schedule'}
                  </button>
                  <button onClick={() => setShowAddSchedule(false)} className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Inline Inspection Form */}
          {activeInspSchedule && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
                  {activeInspSchedule.label} — {activeInspSchedule.formTemplateName}
                </h3>
                <button onClick={() => { setActiveInspSchedule(null); setInspFields([]) }} className="text-xs text-gray-500 hover:underline">Cancel</button>
              </div>

              {inspFormLoading ? (
                <p className="text-sm text-gray-400">Loading form…</p>
              ) : (
                <div className="space-y-6">
                  <FormRenderer
                    fields={inspFields}
                    values={inspValues}
                    errors={inspErrors}
                    onChange={(key, val) => {
                      setInspValues((prev) => ({ ...prev, [key]: val }))
                      setInspErrors((prev) => { const next = { ...prev }; delete next[key]; return next })
                    }}
                  />
                  {inspSubmitError && <p className="text-sm text-danger">{inspSubmitError}</p>}
                  <div className="flex gap-3">
                    <button
                      onClick={() => void handleInspSubmit()}
                      disabled={inspSubmitting}
                      className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50"
                    >
                      {inspSubmitting ? 'Submitting…' : 'Submit Inspection'}
                    </button>
                    <button
                      onClick={() => { setActiveInspSchedule(null); setInspFields([]) }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Change */}
          {canManage && !isDecommissioned && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Change Status</h3>
              <div className="flex items-center gap-3">
                <select value={newStatus} onChange={(e) => { setNewStatus(e.target.value); setConfirmDecomm(false) }} className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy-700">
                  <option value="">Select…</option>
                  {statuses.filter((s) => s !== currentAsset.status).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                  ))}
                </select>
                <button onClick={() => void handleStatusChange()} disabled={statusBusy || !newStatus}
                  className="px-4 py-1.5 bg-navy-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 hover:bg-navy-800">
                  {statusBusy ? '…' : confirmDecomm ? 'Confirm Decommission' : 'Change'}
                </button>
              </div>
              {statusError && <p className="text-xs text-danger mt-2">{statusError}</p>}
              {confirmDecomm && <p className="text-xs text-warning mt-2">Decommissioning is permanent. Click again to confirm.</p>}
            </div>
          )}

          {/* Gear Assignment */}
          {isGear && !isDecommissioned && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Assignment</h3>
              {(currentAsset.assignedToStaffName || currentAsset.assignedToApparatusName) ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-700">
                    Assigned to: <span className="font-semibold">{currentAsset.assignedToStaffName ?? currentAsset.assignedToApparatusName}</span>
                  </p>
                  {canManage && (
                    <button onClick={() => void handleUnassign()} disabled={assignBusy}
                      className="px-3 py-1.5 text-xs text-danger border border-danger rounded-lg hover:bg-danger-bg disabled:opacity-60">
                      {assignBusy ? '…' : 'Unassign'}
                    </button>
                  )}
                </div>
              ) : canManage && (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    {(['staff', 'apparatus'] as const).map((mode) => (
                      <label key={mode} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="assignMode" value={mode} checked={assignMode === mode} onChange={() => setAssignMode(mode)} className="accent-navy-700" />
                        <span className="text-sm font-medium text-gray-700 capitalize">{mode}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {assignMode === 'staff' ? (
                      <select value={assignStaffId} onChange={(e) => setAssignStaffId(e.target.value)} className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy-700">
                        <option value="">Select staff…</option>
                        {(staffList as StaffMember[]).map((s) => (
                          <option key={s.memberId} value={s.memberId}>{s.displayName}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={assignApparatusId}
                        onChange={(e) => setAssignApparatusId(e.target.value)}
                        placeholder="Apparatus ID"
                        className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy-700"
                      />
                    )}
                    <button onClick={() => void handleAssign()} disabled={assignBusy || (assignMode === 'staff' ? !assignStaffId : !assignApparatusId)}
                      className="px-4 py-1.5 bg-navy-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 hover:bg-navy-800">
                      {assignBusy ? '…' : 'Assign'}
                    </button>
                  </div>
                  {assignError && <p className="text-xs text-danger mt-2">{assignError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Inspections (Form Submissions) */}
      {activeTab === 'inspections' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {submissions.length === 0 && submissionsLoaded ? (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-gray-700">No inspections recorded</p>
              <p className="text-xs text-gray-400 mt-1">Use the inspection schedules on the Details tab to perform inspections.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Inspector</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Form</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-condensed)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{sub.submittedAt.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-gray-600">{sub.submittedByName}</td>
                      <td className="px-4 py-3 text-gray-600">{sub.templateName}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/orgs/$orgSlug/forms/submissions/$submissionId"
                          params={{ orgSlug: org.slug, submissionId: sub.id }}
                          className="text-xs text-navy-700 hover:underline font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {submissionsTotal > LIMIT && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <span className="text-sm text-gray-500">Showing {submissionsOffset + 1}–{Math.min(submissionsOffset + submissions.length, submissionsTotal)} of {submissionsTotal}</span>
                  <div className="flex gap-2">
                    <button disabled={submissionsOffset === 0} onClick={() => loadSubmissions(Math.max(0, submissionsOffset - LIMIT))} className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-40">Previous</button>
                    <button disabled={submissionsOffset + submissions.length >= submissionsTotal} onClick={() => loadSubmissions(submissionsOffset + LIMIT)} className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-40">Next</button>
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
              <p className="text-sm font-semibold text-gray-700">No audit log entries</p>
              <p className="text-xs text-gray-400 mt-1">Actions taken on this asset will appear here.</p>
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
                <tbody className="divide-y divide-gray-200">
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
