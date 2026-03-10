import { useState } from 'react'
import { createFileRoute, redirect, useNavigate, useRouteContext } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import type { AssetType } from '@/lib/asset.types'
import { createAssetServerFn } from '@/server/assets'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/assets/new')({
  beforeLoad: async ({ context }) => {
    const { userRole } = context as { userRole: string; org: unknown }
    if (!canDo(userRole as Parameters<typeof canDo>[0], 'manage-assets')) {
      throw redirect({ to: '/orgs/$orgSlug/assets' as never })
    }
  },
  head: () => ({
    meta: [{ title: 'New Asset | Scene Ready' }],
  }),
  component: NewAssetPage,
})

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

function NewAssetPage() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const navigate = useNavigate()

  const [assetType, setAssetType] = useState<AssetType>('apparatus')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [manufactureDate, setManufactureDate] = useState('')
  const [purchasedDate, setPurchasedDate] = useState('')
  const [inServiceDate, setInServiceDate] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [warrantyExpirationDate, setWarrantyExpirationDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const categories = assetType === 'apparatus' ? APPARATUS_CATEGORIES : GEAR_CATEGORIES

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Name is required.'); return }
    if (!category) { setError('Category is required.'); return }
    if (assetType === 'apparatus' && !unitNumber.trim()) { setError('Unit number is required for apparatus.'); return }

    setBusy(true)
    try {
      const result = await createAssetServerFn({
        data: {
          orgSlug: org.slug,
          assetType,
          name: name.trim(),
          category,
          unitNumber: assetType === 'apparatus' ? unitNumber.trim() : undefined,
          serialNumber: serialNumber.trim() || undefined,
          make: make.trim() || undefined,
          model: model.trim() || undefined,
          manufactureDate: manufactureDate || undefined,
          purchasedDate: purchasedDate || undefined,
          inServiceDate: inServiceDate || undefined,
          expirationDate: expirationDate || undefined,
          warrantyExpirationDate: warrantyExpirationDate || undefined,
          notes: notes.trim() || undefined,
        },
      })

      if (!result.success) {
        if (result.error === 'DUPLICATE_UNIT_NUMBER') setError('An asset with this unit number already exists.')
        else if (result.error === 'DUPLICATE_SERIAL_NUMBER') setError('An asset with this serial number already exists.')
        else if (result.error === 'INVALID_CATEGORY') setError('Invalid category for this asset type.')
        else setError('Failed to create asset. Please check your inputs.')
        return
      }

      await navigate({
        to: '/orgs/$orgSlug/assets/$assetId' as never,
        params: { orgSlug: org.slug, assetId: result.asset.id } as never,
      })
    } finally {
      setBusy(false)
    }
  }

  function handleTypeChange(t: AssetType) {
    setAssetType(t)
    setCategory('')
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="max-w-2xl">
      {/* Back link */}
      <a
        href={`/orgs/${org.slug}/assets`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Assets
      </a>

      <h1 className="text-2xl font-bold text-navy-700 mb-6" style={{ fontFamily: 'var(--font-sans)' }}>
        Add New Asset
      </h1>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          {/* Asset type selector */}
          <div>
            <label className={labelCls}>Asset Type <span className="text-danger">*</span></label>
            <div className="flex gap-3">
              {(['apparatus', 'gear'] as AssetType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-lg border-2 transition-colors capitalize ${
                    assetType === t
                      ? 'border-navy-700 bg-navy-700 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className={labelCls}>Name <span className="text-danger">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={assetType === 'apparatus' ? 'e.g. Engine 1' : 'e.g. SCBA Unit 04'}
              maxLength={200}
              className={inputCls}
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className={labelCls}>Category <span className="text-danger">*</span></label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
              required
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Apparatus: unit number */}
          {assetType === 'apparatus' && (
            <div>
              <label className={labelCls}>Unit Number <span className="text-danger">*</span></label>
              <input
                type="text"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="e.g. E-1"
                className={inputCls}
                required
              />
            </div>
          )}

          {/* Serial number */}
          <div>
            <label className={labelCls}>Serial Number</label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Optional"
              className={inputCls}
            />
          </div>

          {/* Make / Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Make</label>
              <input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Manufacturer" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model name" className={inputCls} />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Manufacture Date</label>
              <input type="date" value={manufactureDate} onChange={(e) => setManufactureDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Purchase Date</label>
              <input type="date" value={purchasedDate} onChange={(e) => setPurchasedDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>In Service Date</label>
              <input type="date" value={inServiceDate} onChange={(e) => setInServiceDate(e.target.value)} className={inputCls} />
            </div>
            {assetType === 'gear' && (
              <div>
                <label className={labelCls}>Expiration Date</label>
                <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Warranty Expiration</label>
              <input type="date" value={warrantyExpirationDate} onChange={(e) => setWarrantyExpirationDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

          {error && (
            <div className="px-4 py-3 bg-danger-bg text-danger text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2.5 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Creating…' : 'Create Asset'}
            </button>
            <a
              href={`/orgs/${org.slug}/assets`}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors text-center"
            >
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
