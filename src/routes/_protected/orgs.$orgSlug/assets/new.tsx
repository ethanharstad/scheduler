import { useState } from 'react'
import { createFileRoute, useNavigate, useRouteContext, redirect, Link } from '@tanstack/react-router'
import { canDo } from '@/lib/rbac'
import { ChevronLeft } from 'lucide-react'
import type { AssetType } from '@/lib/asset.types'
import { APPARATUS_CATEGORIES, GEAR_CATEGORIES, APPARATUS_STATUSES, GEAR_STATUSES } from '@/lib/asset.types'
import { createAssetServerFn } from '@/server/assets'
import { useToast } from '@/lib/toast'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets/new')({
  head: () => ({ meta: [{ title: 'Add Asset | Scene Ready' }] }),
  beforeLoad: async ({ context }) => {
    const ctx = context as { userRole?: string }
    if (ctx.userRole && !canDo(ctx.userRole as Parameters<typeof canDo>[0], 'manage-assets')) {
      throw redirect({ to: '/orgs/$orgSlug/assets/' as never })
    }
  },
  component: NewAssetPage,
})

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'Engine',
  ladder_truck: 'Ladder Truck',
  ambulance_medic: 'Ambulance/Medic',
  battalion_chief: 'Battalion Chief',
  rescue: 'Rescue',
  brush_wildland: 'Brush/Wildland',
  tanker_tender: 'Tanker/Tender',
  boat: 'Boat',
  atv_utv: 'ATV/UTV',
  command_vehicle: 'Command Vehicle',
  utility: 'Utility',
  scba: 'SCBA',
  ppe: 'PPE',
  radio: 'Radio',
  medical_equipment: 'Medical Equipment',
  tools: 'Tools',
  hose: 'Hose',
  nozzle: 'Nozzle',
  thermal_camera: 'Thermal Camera',
  gas_detector: 'Gas Detector',
  lighting: 'Lighting',
  extrication: 'Extrication',
  rope_rescue: 'Rope Rescue',
  water_rescue: 'Water Rescue',
  hazmat: 'HazMat',
  other: 'Other',
}

const STATUS_LABELS: Record<string, string> = {
  in_service: 'In Service',
  out_of_service: 'Out of Service',
  reserve: 'Reserve',
  decommissioned: 'Decommissioned',
  available: 'Available',
  assigned: 'Assigned',
  expired: 'Expired',
}

function NewAssetPage() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const navigate = useNavigate()
  const toast = useToast()

  if (!canDo(userRole, 'manage-assets')) {
    return <p className="text-sm text-gray-500">You don't have permission to add assets.</p>
  }

  const [assetType, setAssetType] = useState<AssetType>('apparatus')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [notes, setNotes] = useState('')
  const [manufactureDate, setManufactureDate] = useState('')
  const [purchasedDate, setPurchasedDate] = useState('')
  const [inServiceDate, setInServiceDate] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [warrantyExpirationDate, setWarrantyExpirationDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const categories = assetType === 'apparatus' ? APPARATUS_CATEGORIES : GEAR_CATEGORIES
  const statuses = assetType === 'apparatus' ? APPARATUS_STATUSES : GEAR_STATUSES

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Name is required'); return }
    if (!category) { setError('Category is required'); return }
    if (assetType === 'apparatus' && !unitNumber.trim()) { setError('Unit number is required for apparatus'); return }

    setBusy(true)
    const result = await createAssetServerFn({
      data: {
        orgSlug: org.slug,
        assetType,
        name: name.trim(),
        category,
        status: status || undefined,
        unitNumber: assetType === 'apparatus' ? unitNumber.trim() : undefined,
        serialNumber: serialNumber.trim() || undefined,
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        notes: notes.trim() || undefined,
        manufactureDate: manufactureDate || undefined,
        purchasedDate: purchasedDate || undefined,
        inServiceDate: inServiceDate || undefined,
        expirationDate: expirationDate || undefined,
        warrantyExpirationDate: warrantyExpirationDate || undefined,
      },
    })
    setBusy(false)

    if (!result.success) {
      if (result.error === 'DUPLICATE_UNIT_NUMBER') setError('Unit number already exists in this org.')
      else if (result.error === 'DUPLICATE_SERIAL_NUMBER') setError('Serial number already exists in this org.')
      else if (result.error === 'INVALID_CATEGORY') setError('Invalid category for this asset type.')
      else setError('Failed to create asset. Please try again.')
      return
    }

    toast.success('Asset created', `${result.asset.name} has been added to inventory.`)
    await navigate({
      to: '/orgs/$orgSlug/assets/$assetId',
      params: { orgSlug: org.slug, assetId: result.asset.id },
    })
  }

  const inputClass = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        to="/orgs/$orgSlug/assets"
        params={{ orgSlug: org.slug }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Assets
      </Link>
      <h2 className="text-xl font-bold text-navy-700 mb-6" style={{ fontFamily: 'var(--font-condensed)' }}>
        Add New Asset
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Asset Type selector */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Asset Type</h3>
          <div className="flex gap-3">
            {(['apparatus', 'gear'] as AssetType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setAssetType(t); setCategory(''); setStatus('') }}
                className={`flex-1 py-3 rounded-lg border-2 text-sm font-semibold transition-colors ${assetType === t ? 'border-navy-700 bg-navy-700 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {t === 'apparatus' ? 'Apparatus' : 'Gear / Equipment'}
              </button>
            ))}
          </div>
        </div>

        {/* Core fields */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Basic Info</h3>

          <div>
            <label className={labelClass}>Name <span className="text-danger">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Engine 1, Self-Contained Breathing Apparatus" maxLength={200} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Category <span className="text-danger">*</span></label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} required>
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                <option value="">{assetType === 'apparatus' ? 'In Service (default)' : 'Available (default)'}</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
          </div>

          {assetType === 'apparatus' && (
            <div>
              <label className={labelClass}>Unit Number <span className="text-danger">*</span></label>
              <input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className={inputClass} placeholder="e.g. E-1, L-3, M-7" required />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Make</label>
              <input type="text" value={make} onChange={(e) => setMake(e.target.value)} className={inputClass} placeholder="Manufacturer" />
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} placeholder="Model name" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Serial Number {assetType === 'apparatus' ? '/ VIN' : ''}</label>
            <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className={inputClass} placeholder="Optional, must be unique" />
          </div>
        </div>

        {/* Lifecycle dates */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3" style={{ fontFamily: 'var(--font-condensed)' }}>Lifecycle Dates</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Manufacture Date</label>
              <input type="date" value={manufactureDate} onChange={(e) => setManufactureDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Purchased Date</label>
              <input type="date" value={purchasedDate} onChange={(e) => setPurchasedDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>In Service Date</label>
              <input type="date" value={inServiceDate} onChange={(e) => setInServiceDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Expiration Date</label>
              <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Warranty Expiration</label>
              <input type="date" value={warrantyExpirationDate} onChange={(e) => setWarrantyExpirationDate(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={3} placeholder="Optional notes…" />
        </div>

        {error && (
          <div className="bg-danger-bg border border-danger/20 rounded-lg px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2.5 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 disabled:opacity-60 transition-colors"
          >
            {busy ? 'Creating…' : 'Create Asset'}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: '/orgs/$orgSlug/assets', params: { orgSlug: org.slug } })}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
