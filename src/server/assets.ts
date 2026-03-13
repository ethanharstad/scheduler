import { createServerFn } from '@tanstack/react-start'
import { requireOrgMembership } from '@/server/_helpers'
import { getOrgStub } from '@/server/_do-helpers'
import { canDo } from '@/lib/rbac'
import { validateInspectionRRule, rruleToIntervalDays, computeNextDue } from '@/lib/rrule'
import type {
  AssetView,
  AssetDetailView,
  InspectionScheduleView,
  AssetLocationView,
  AssetAuditEntry,
  CreateAssetInput,
  CreateAssetOutput,
  UpdateAssetInput,
  UpdateAssetOutput,
  GetAssetInput,
  GetAssetOutput,
  ListAssetsInput,
  ListAssetsOutput,
  ChangeAssetStatusInput,
  ChangeAssetStatusOutput,
  AssignGearInput,
  AssignGearOutput,
  UnassignGearInput,
  UnassignGearOutput,
  AddInspectionScheduleInput,
  AddInspectionScheduleOutput,
  UpdateInspectionScheduleInput,
  UpdateInspectionScheduleOutput,
  DeleteInspectionScheduleInput,
  DeleteInspectionScheduleOutput,
  GetInspectionSchedulesInput,
  GetInspectionSchedulesOutput,
  GetExpiringAssetsInput,
  GetExpiringAssetsOutput,
  GetOverdueInspectionsInput,
  GetOverdueInspectionsOutput,
  OverdueInspectionView,
  GetMyGearInput,
  GetMyGearOutput,
  GetApparatusGearInput,
  GetApparatusGearOutput,
  GetAssetAuditLogInput,
  GetAssetAuditLogOutput,
  CreateAssetLocationInput,
  CreateAssetLocationOutput,
  UpdateAssetLocationInput,
  UpdateAssetLocationOutput,
  DeleteAssetLocationInput,
  DeleteAssetLocationOutput,
  ListAssetLocationsInput,
  ListAssetLocationsOutput,
} from '@/lib/asset.types'
import {
  APPARATUS_CATEGORIES,
  GEAR_CATEGORIES,
  APPARATUS_STATUSES,
  GEAR_STATUSES,
} from '@/lib/asset.types'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isoNow(): string {
  return new Date().toISOString()
}

// Returns the org's "current date" as YYYY-MM-DD.
// The org day rolls over at scheduleDayStart (HH:MM), not midnight.
// e.g. if scheduleDayStart='07:00' and it's 05:30 UTC, it's still "yesterday".
function orgToday(scheduleDayStart: string): string {
  const now = new Date()
  const [startH, startM] = scheduleDayStart.split(':').map(Number)
  const dayStartMs = ((startH ?? 0) * 60 + (startM ?? 0)) * 60 * 1000
  const utcMs = now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000 + now.getUTCSeconds() * 1000
  // If current UTC time of day is before the org's day start, we're still in "yesterday"
  const effectiveDate = utcMs < dayStartMs ? new Date(now.getTime() - 86400000) : now
  return effectiveDate.toISOString().slice(0, 10)
}

async function getScheduleDayStart(env: Cloudflare.Env, orgId: string): Promise<string> {
  const stub = getOrgStub(env, orgId)
  const rows = await stub.query(
    `SELECT schedule_day_start FROM org_settings WHERE id = 'settings'`,
  ) as { schedule_day_start: string }[]
  return rows[0]?.schedule_day_start ?? '00:00'
}

async function recomputeScheduleNextDue(
  env: Cloudflare.Env,
  orgId: string,
  scheduleId: string,
  rrule: string,
): Promise<string> {
  type SubRow = { submitted_at: string }
  const stub = getOrgStub(env, orgId)
  const subRows = await stub.query(
    `SELECT submitted_at FROM form_submission
     WHERE schedule_id = ? AND status = 'complete'
     ORDER BY submitted_at DESC LIMIT 1`,
    scheduleId,
  ) as SubRow[]
  const lastSub = subRows[0] ?? null

  const dayStart = await getScheduleDayStart(env, orgId)
  const base = lastSub ? lastSub.submitted_at.slice(0, 10) : orgToday(dayStart)
  return computeNextDue(base, rrule, !!lastSub)
}

function validateCategory(assetType: 'apparatus' | 'gear', category: string): boolean {
  if (assetType === 'apparatus') return (APPARATUS_CATEGORIES as string[]).includes(category)
  return (GEAR_CATEGORIES as string[]).includes(category)
}

function validateStatus(assetType: 'apparatus' | 'gear', status: string): boolean {
  if (assetType === 'apparatus') return (APPARATUS_STATUSES as string[]).includes(status)
  return (GEAR_STATUSES as string[]).includes(status)
}

function validateCustomFields(fields: unknown): fields is Record<string, string | number | boolean> {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return false
  const json = JSON.stringify(fields)
  if (json.length > 10240) return false
  for (const val of Object.values(fields as Record<string, unknown>)) {
    if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return false
  }
  return true
}

async function writeAssetAuditLog(
  env: Cloudflare.Env,
  orgId: string,
  actorStaffId: string,
  action: string,
  assetId: string,
  detail?: Record<string, string | number | boolean | null | object>,
): Promise<void> {
  try {
    const id = crypto.randomUUID()
    const now = isoNow()
    const detailJson = detail ? JSON.stringify(detail) : null
    const stub = getOrgStub(env, orgId)
    await stub.execute(
      `INSERT INTO asset_audit_log (id, actor_staff_id, action, asset_id, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, actorStaffId, action, assetId, detailJson, now,
    )
  } catch {
    // Audit logging must never break the primary operation
  }
}

// ---------------------------------------------------------------------------
// Row → view mapping helpers
// ---------------------------------------------------------------------------

type AssetRow = {
  id: string
  asset_type: string
  name: string
  category: string
  status: string
  serial_number: string | null
  make: string | null
  model: string | null
  unit_number: string | null
  assigned_to_staff_id: string | null
  assigned_to_staff_name: string | null
  assigned_to_apparatus_id: string | null
  assigned_to_apparatus_name: string | null
  assigned_to_location_id: string | null
  assigned_to_location_name: string | null
  expiration_date: string | null
  created_at: string
  updated_at: string
}

type AssetDetailRow = AssetRow & {
  notes: string | null
  manufacture_date: string | null
  purchased_date: string | null
  in_service_date: string | null
  warranty_expiration_date: string | null
  custom_fields: string | null
}

function rowToAssetView(r: AssetRow, orgId: string): AssetView {
  return {
    id: r.id,
    orgId,
    assetType: r.asset_type as 'apparatus' | 'gear',
    name: r.name,
    category: r.category,
    status: r.status,
    serialNumber: r.serial_number,
    make: r.make,
    model: r.model,
    unitNumber: r.unit_number,
    assignedToStaffId: r.assigned_to_staff_id,
    assignedToStaffName: r.assigned_to_staff_name,
    assignedToApparatusId: r.assigned_to_apparatus_id,
    assignedToApparatusName: r.assigned_to_apparatus_name,
    assignedToLocationId: r.assigned_to_location_id,
    assignedToLocationName: r.assigned_to_location_name,
    expirationDate: r.expiration_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToAssetDetailView(r: AssetDetailRow, orgId: string): AssetDetailView {
  return {
    ...rowToAssetView(r, orgId),
    notes: r.notes,
    manufactureDate: r.manufacture_date,
    purchasedDate: r.purchased_date,
    inServiceDate: r.in_service_date,
    warrantyExpirationDate: r.warranty_expiration_date,
    customFields: r.custom_fields ? (JSON.parse(r.custom_fields) as Record<string, string | number | boolean>) : null,
  }
}

const ASSET_LIST_SELECT = `
  a.id, a.asset_type, a.name, a.category, a.status,
  a.serial_number, a.make, a.model, a.unit_number,
  a.assigned_to_staff_id,
  sm.name AS assigned_to_staff_name,
  a.assigned_to_apparatus_id,
  app.name AS assigned_to_apparatus_name,
  a.assigned_to_location_id,
  loc.name AS assigned_to_location_name,
  a.expiration_date,
  a.created_at, a.updated_at`

const ASSET_DETAIL_SELECT = `
  a.id, a.asset_type, a.name, a.category, a.status,
  a.serial_number, a.make, a.model, a.unit_number,
  a.assigned_to_staff_id,
  sm.name AS assigned_to_staff_name,
  a.assigned_to_apparatus_id,
  app.name AS assigned_to_apparatus_name,
  a.assigned_to_location_id,
  loc.name AS assigned_to_location_name,
  a.expiration_date,
  a.created_at, a.updated_at,
  a.notes, a.manufacture_date, a.purchased_date, a.in_service_date,
  a.warranty_expiration_date, a.custom_fields`

const ASSET_JOINS = `
  LEFT JOIN staff_member sm ON sm.id = a.assigned_to_staff_id
  LEFT JOIN asset app ON app.id = a.assigned_to_apparatus_id
  LEFT JOIN asset_location loc ON loc.id = a.assigned_to_location_id`

// ---------------------------------------------------------------------------
// A. Asset CRUD
// ---------------------------------------------------------------------------

export const createAssetServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateAssetInput) => d)
  .handler(async (ctx): Promise<CreateAssetOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const name = data.name?.trim()
    if (!name || name.length > 200) return { success: false, error: 'INVALID_INPUT' }

    if (!validateCategory(data.assetType, data.category)) {
      return { success: false, error: 'INVALID_CATEGORY' }
    }

    if (data.assetType === 'apparatus' && !data.unitNumber?.trim()) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    const status = data.status ?? (data.assetType === 'apparatus' ? 'in_service' : 'available')
    if (!validateStatus(data.assetType, status)) return { success: false, error: 'INVALID_INPUT' }

    if (data.customFields !== undefined && !validateCustomFields(data.customFields)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    // Get staff member id for actor
    const stub = getOrgStub(env, membership.orgId)
    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    const id = crypto.randomUUID()
    const now = isoNow()
    const customFieldsJson = data.customFields ? JSON.stringify(data.customFields) : null

    try {
      await stub.execute(
        `INSERT INTO asset (
          id, asset_type, name, category, status,
          serial_number, make, model, notes,
          manufacture_date, purchased_date, in_service_date, expiration_date, warranty_expiration_date,
          custom_fields, unit_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        data.assetType,
        name,
        data.category,
        status,
        data.serialNumber?.trim() || null,
        data.make?.trim() || null,
        data.model?.trim() || null,
        data.notes?.trim() || null,
        data.manufactureDate || null,
        data.purchasedDate || null,
        data.inServiceDate || null,
        data.expirationDate || null,
        data.warrantyExpirationDate || null,
        customFieldsJson,
        data.assetType === 'apparatus' ? data.unitNumber!.trim() : null,
        now,
        now,
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('idx_asset_unit')) return { success: false, error: 'DUPLICATE_UNIT_NUMBER' }
      if (msg.includes('idx_asset_serial')) return { success: false, error: 'DUPLICATE_SERIAL_NUMBER' }
      throw e
    }

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.created', id)
    }

    const rows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
      id,
    ) as AssetRow[]

    return { success: true, asset: rowToAssetView(rows[0]!, membership.orgId) }
  })

export const updateAssetServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateAssetInput) => d)
  .handler(async (ctx): Promise<UpdateAssetOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    type AssetBasicRow = { id: string; asset_type: string; status: string; name: string; category: string; serial_number: string | null; make: string | null; model: string | null; unit_number: string | null; notes: string | null; manufacture_date: string | null; purchased_date: string | null; in_service_date: string | null; expiration_date: string | null; warranty_expiration_date: string | null; custom_fields: string | null }
    const existingRows = await stub.query(
      `SELECT id, asset_type, status, name, category, serial_number, make, model, unit_number, notes, manufacture_date, purchased_date, in_service_date, expiration_date, warranty_expiration_date, custom_fields FROM asset WHERE id = ?`,
      data.assetId,
    ) as AssetBasicRow[]
    const existing = existingRows[0] ?? null

    if (!existing) return { success: false, error: 'NOT_FOUND' }
    if (existing.status === 'decommissioned') return { success: false, error: 'DECOMMISSIONED' }

    const newCategory = data.category ?? existing.category
    if (data.category !== undefined && !validateCategory(existing.asset_type as 'apparatus' | 'gear', newCategory)) {
      return { success: false, error: 'INVALID_CATEGORY' }
    }

    if (data.customFields !== undefined && data.customFields !== null && !validateCustomFields(data.customFields)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    const now = isoNow()
    const newName = data.name?.trim() ?? existing.name
    if (data.name !== undefined && (!newName || newName.length > 200)) return { success: false, error: 'INVALID_INPUT' }

    // Track changes for audit log
    const changes: Record<string, string | number | boolean | null | object> = {}
    if (data.name !== undefined && newName !== existing.name) changes['name'] = { from: existing.name, to: newName }
    if (data.category !== undefined && newCategory !== existing.category) changes['category'] = { from: existing.category, to: newCategory }

    const customFieldsJson = data.customFields === null ? null
      : data.customFields !== undefined ? JSON.stringify(data.customFields)
      : existing.custom_fields

    try {
      await stub.execute(
        `UPDATE asset SET
          name = ?,
          category = ?,
          serial_number = ?,
          make = ?,
          model = ?,
          notes = ?,
          manufacture_date = ?,
          purchased_date = ?,
          in_service_date = ?,
          expiration_date = ?,
          warranty_expiration_date = ?,
          custom_fields = ?,
          unit_number = ?,
          updated_at = ?
        WHERE id = ?`,
        newName,
        newCategory,
        'serialNumber' in data ? (data.serialNumber?.trim() || null) : existing.serial_number,
        'make' in data ? (data.make?.trim() || null) : existing.make,
        'model' in data ? (data.model?.trim() || null) : existing.model,
        'notes' in data ? (data.notes?.trim() || null) : existing.notes,
        'manufactureDate' in data ? (data.manufactureDate || null) : existing.manufacture_date,
        'purchasedDate' in data ? (data.purchasedDate || null) : existing.purchased_date,
        'inServiceDate' in data ? (data.inServiceDate || null) : existing.in_service_date,
        'expirationDate' in data ? (data.expirationDate || null) : existing.expiration_date,
        'warrantyExpirationDate' in data ? (data.warrantyExpirationDate || null) : existing.warranty_expiration_date,
        customFieldsJson,
        existing.asset_type === 'apparatus' ? (data.unitNumber?.trim() || existing.unit_number) : null,
        now,
        data.assetId,
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('idx_asset_unit')) return { success: false, error: 'DUPLICATE_UNIT_NUMBER' }
      if (msg.includes('idx_asset_serial')) return { success: false, error: 'DUPLICATE_SERIAL_NUMBER' }
      throw e
    }

    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.updated', data.assetId, changes)
    }

    const readbackRows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
      data.assetId,
    ) as AssetRow[]

    return { success: true, asset: rowToAssetView(readbackRows[0]!, membership.orgId) }
  })

export const getAssetServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetAssetInput) => d)
  .handler(async (ctx): Promise<GetAssetOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    const rows = await stub.query(
      `SELECT ${ASSET_DETAIL_SELECT}
       FROM asset a ${ASSET_JOINS}
       WHERE a.id = ?`,
      data.assetId,
    ) as AssetDetailRow[]
    if (rows.length === 0) return { success: false, error: 'NOT_FOUND' }
    return { success: true, asset: rowToAssetDetailView(rows[0]!, membership.orgId) }
  })

export const listAssetsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ListAssetsInput) => d)
  .handler(async (ctx): Promise<ListAssetsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = data.offset ?? 0

    const stub = getOrgStub(env, membership.orgId)

    const conditions: string[] = []
    const bindings: unknown[] = []

    if (data.assetType) {
      conditions.push('a.asset_type = ?')
      bindings.push(data.assetType)
    }
    if (data.status) {
      conditions.push('a.status = ?')
      bindings.push(data.status)
    }
    if (data.category) {
      conditions.push('a.category = ?')
      bindings.push(data.category)
    }
    if (data.assignedToStaffId) {
      conditions.push('a.assigned_to_staff_id = ?')
      bindings.push(data.assignedToStaffId)
    }
    if (data.assignedToApparatusId) {
      conditions.push('a.assigned_to_apparatus_id = ?')
      bindings.push(data.assignedToApparatusId)
    }
    if (data.search) {
      conditions.push(`(a.name LIKE ? OR a.unit_number LIKE ? OR a.serial_number LIKE ?)`)
      const term = `%${data.search}%`
      bindings.push(term, term, term)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRows = await stub.query(
      `SELECT COUNT(*) as cnt FROM asset a ${where}`,
      ...bindings,
    ) as { cnt: number }[]
    const total = countRows[0]?.cnt ?? 0

    const rows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT}
       FROM asset a ${ASSET_JOINS}
       ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      ...bindings, limit, offset,
    ) as AssetRow[]

    return { success: true, assets: rows.map((r) => rowToAssetView(r, membership.orgId)), total }
  })

// ---------------------------------------------------------------------------
// B. Status Management
// ---------------------------------------------------------------------------

export const changeAssetStatusServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ChangeAssetStatusInput) => d)
  .handler(async (ctx): Promise<ChangeAssetStatusOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    type AssetBasicRow = { id: string; asset_type: string; status: string; assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null }
    const assetRows = await stub.query(
      `SELECT id, asset_type, status, assigned_to_staff_id, assigned_to_apparatus_id FROM asset WHERE id = ?`,
      data.assetId,
    ) as AssetBasicRow[]
    const asset = assetRows[0] ?? null

    if (!asset) return { success: false, error: 'NOT_FOUND' }
    if (asset.status === 'decommissioned') return { success: false, error: 'DECOMMISSIONED' }
    if (!validateStatus(asset.asset_type as 'apparatus' | 'gear', data.newStatus)) {
      return { success: false, error: 'INVALID_STATUS' }
    }

    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    const now = isoNow()
    const oldStatus = asset.status

    if (data.newStatus === 'decommissioned' && asset.asset_type === 'apparatus') {
      // Unassign all gear from this apparatus
      type GearRow = { id: string }
      const gearRows = await stub.query(
        `SELECT id FROM asset WHERE assigned_to_apparatus_id = ?`,
        asset.id,
      ) as GearRow[]

      await stub.executeBatch([
        { sql: `UPDATE asset SET assigned_to_apparatus_id = NULL, assigned_to_location_id = NULL, status = 'available', updated_at = ? WHERE assigned_to_apparatus_id = ?`, params: [now, asset.id] },
        { sql: `UPDATE asset SET status = ?, updated_at = ? WHERE id = ?`, params: [data.newStatus, now, asset.id] },
      ])

      if (staffRow) {
        await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.status_changed', asset.id, { from: oldStatus, to: data.newStatus })
        for (const gear of gearRows) {
          await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.unassigned', gear.id, { reason: 'apparatus_decommissioned' })
        }
      }
    } else if (data.newStatus === 'decommissioned' && asset.asset_type === 'gear') {
      // Clear assignment if exists
      await stub.execute(
        `UPDATE asset SET status = ?, assigned_to_staff_id = NULL, assigned_to_apparatus_id = NULL, assigned_to_location_id = NULL, updated_at = ? WHERE id = ?`,
        data.newStatus, now, asset.id,
      )

      if (staffRow) {
        if (asset.assigned_to_staff_id || asset.assigned_to_apparatus_id) {
          await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.unassigned', asset.id, { reason: 'gear_decommissioned' })
        }
        await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.status_changed', asset.id, { from: oldStatus, to: data.newStatus })
      }
    } else {
      await stub.execute(
        `UPDATE asset SET status = ?, updated_at = ? WHERE id = ?`,
        data.newStatus, now, asset.id,
      )

      if (staffRow) {
        await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.status_changed', asset.id, { from: oldStatus, to: data.newStatus })
      }
    }

    const readbackRows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
      data.assetId,
    ) as AssetRow[]

    return { success: true, asset: rowToAssetView(readbackRows[0]!, membership.orgId) }
  })

// ---------------------------------------------------------------------------
// C. Gear Assignment
// ---------------------------------------------------------------------------

export const assignGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: AssignGearInput) => d)
  .handler(async (ctx): Promise<AssignGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    if (!data.assignToStaffId && !data.assignToApparatusId) return { success: false, error: 'INVALID_INPUT' }
    if (data.assignToStaffId && data.assignToApparatusId) return { success: false, error: 'INVALID_INPUT' }

    const stub = getOrgStub(env, membership.orgId)
    type AssetBasicRow = { id: string; asset_type: string; status: string; assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null }
    const assetRows = await stub.query(
      `SELECT id, asset_type, status, assigned_to_staff_id, assigned_to_apparatus_id FROM asset WHERE id = ?`,
      data.assetId,
    ) as AssetBasicRow[]
    const asset = assetRows[0] ?? null

    if (!asset) return { success: false, error: 'NOT_FOUND' }
    if (asset.asset_type !== 'gear') return { success: false, error: 'NOT_GEAR' }
    if (asset.status === 'decommissioned') return { success: false, error: 'DECOMMISSIONED' }
    if (asset.status === 'expired') return { success: false, error: 'EXPIRED' }

    type StaffRow = { id: string }
    const actorStaffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const actorStaffRow = actorStaffRows[0] ?? null

    // Validate target exists
    if (data.assignToStaffId) {
      const targetStaffRows = await stub.query(
        `SELECT id FROM staff_member WHERE id = ? AND status != 'removed'`,
        data.assignToStaffId,
      ) as { id: string }[]
      if (targetStaffRows.length === 0) return { success: false, error: 'INVALID_TARGET' }
    }

    if (data.assignToApparatusId) {
      const targetAppRows = await stub.query(
        `SELECT id FROM asset WHERE id = ? AND asset_type = 'apparatus'`,
        data.assignToApparatusId,
      ) as { id: string }[]
      if (targetAppRows.length === 0) return { success: false, error: 'INVALID_TARGET' }
    }

    // Validate optional location belongs to the target asset
    const locationId = data.assignToLocationId || null
    if (locationId) {
      const targetAssetId = data.assignToApparatusId || data.assignToStaffId
      if (!targetAssetId) return { success: false, error: 'INVALID_INPUT' }
      // Location must belong to the apparatus being assigned to
      if (!data.assignToApparatusId) return { success: false, error: 'INVALID_INPUT' }
      const locRows = await stub.query(
        `SELECT id FROM asset_location WHERE id = ? AND asset_id = ?`,
        locationId, data.assignToApparatusId,
      ) as { id: string }[]
      if (locRows.length === 0) return { success: false, error: 'INVALID_TARGET' }
    }

    const now = isoNow()
    const wasPreviouslyAssigned = asset.assigned_to_staff_id || asset.assigned_to_apparatus_id

    await stub.execute(
      `UPDATE asset SET assigned_to_staff_id = ?, assigned_to_apparatus_id = ?, assigned_to_location_id = ?, status = 'assigned', updated_at = ? WHERE id = ?`,
      data.assignToStaffId || null,
      data.assignToApparatusId || null,
      locationId,
      now,
      asset.id,
    )

    if (actorStaffRow) {
      if (wasPreviouslyAssigned) {
        await writeAssetAuditLog(env, membership.orgId, actorStaffRow.id, 'asset.unassigned', asset.id, {
          from_staff_id: asset.assigned_to_staff_id,
          from_apparatus_id: asset.assigned_to_apparatus_id,
        })
      }
      await writeAssetAuditLog(env, membership.orgId, actorStaffRow.id, 'asset.assigned', asset.id, {
        to_staff_id: data.assignToStaffId || null,
        to_apparatus_id: data.assignToApparatusId || null,
        to_location_id: locationId,
      })
    }

    const readbackRows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
      data.assetId,
    ) as AssetRow[]

    return { success: true, asset: rowToAssetView(readbackRows[0]!, membership.orgId) }
  })

export const unassignGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UnassignGearInput) => d)
  .handler(async (ctx): Promise<UnassignGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    type AssetBasicRow = { id: string; asset_type: string; status: string; assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null }
    const assetRows = await stub.query(
      `SELECT id, asset_type, status, assigned_to_staff_id, assigned_to_apparatus_id FROM asset WHERE id = ?`,
      data.assetId,
    ) as AssetBasicRow[]
    const asset = assetRows[0] ?? null

    if (!asset) return { success: false, error: 'NOT_FOUND' }

    const isAssigned = asset.assigned_to_staff_id || asset.assigned_to_apparatus_id
    if (!isAssigned) return { success: false, error: 'NOT_ASSIGNED' }

    // Revert to 'available' unless out_of_service/decommissioned
    const newStatus = asset.status === 'out_of_service' || asset.status === 'decommissioned'
      ? asset.status
      : 'available'

    const now = isoNow()
    await stub.execute(
      `UPDATE asset SET assigned_to_staff_id = NULL, assigned_to_apparatus_id = NULL, assigned_to_location_id = NULL, status = ?, updated_at = ? WHERE id = ?`,
      newStatus, now, asset.id,
    )

    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.unassigned', asset.id, {
        from_staff_id: asset.assigned_to_staff_id,
        from_apparatus_id: asset.assigned_to_apparatus_id,
      })
    }

    const readbackRows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
      data.assetId,
    ) as AssetRow[]

    return { success: true, asset: rowToAssetView(readbackRows[0]!, membership.orgId) }
  })

// ---------------------------------------------------------------------------
// D. Inspection Schedules
// ---------------------------------------------------------------------------

type ScheduleRow = {
  id: string
  asset_id: string
  form_template_id: string
  form_template_name: string
  label: string
  recurrence_rule: string
  interval_days: number
  next_inspection_due: string | null
  is_active: number
  created_at: string
  updated_at: string
}

function rowToScheduleView(r: ScheduleRow): InspectionScheduleView {
  return {
    id: r.id,
    assetId: r.asset_id,
    formTemplateId: r.form_template_id,
    formTemplateName: r.form_template_name,
    label: r.label,
    recurrenceRule: r.recurrence_rule,
    intervalDays: r.interval_days,
    nextInspectionDue: r.next_inspection_due,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const SCHEDULE_SELECT = `
  ais.id, ais.asset_id, ais.form_template_id,
  ft.name AS form_template_name,
  ais.label, ais.recurrence_rule, ais.interval_days,
  ais.next_inspection_due, ais.is_active,
  ais.created_at, ais.updated_at`

const SCHEDULE_JOIN = `LEFT JOIN form_template ft ON ft.id = ais.form_template_id`

export const addInspectionScheduleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: AddInspectionScheduleInput) => d)
  .handler(async (ctx): Promise<AddInspectionScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const label = data.label?.trim()
    if (!label || label.length > 200) return { success: false, error: 'INVALID_INPUT' }

    const stub = getOrgStub(env, membership.orgId)
    const assetRows = await stub.query(`SELECT id FROM asset WHERE id = ?`, data.assetId) as { id: string }[]
    if (assetRows.length === 0) return { success: false, error: 'NOT_FOUND' }

    // Validate form template exists, belongs to org (or is system), and is published
    type TplRow = { id: string; status: string; org_id: string | null; is_system: number }
    const tplRows = await stub.query(
      `SELECT id, status, org_id, is_system FROM form_template WHERE id = ?`,
      data.formTemplateId,
    ) as TplRow[]
    const tpl = tplRows[0] ?? null

    if (!tpl) return { success: false, error: 'TEMPLATE_NOT_FOUND' }
    if (tpl.org_id !== null && tpl.org_id !== membership.orgId && tpl.is_system !== 1) {
      return { success: false, error: 'TEMPLATE_NOT_FOUND' }
    }
    if (tpl.status !== 'published') return { success: false, error: 'TEMPLATE_NOT_PUBLISHED' }

    const rrule = data.recurrenceRule
    if (!validateInspectionRRule(rrule)) return { success: false, error: 'INVALID_RECURRENCE_RULE' }

    const intervalDays = rruleToIntervalDays(rrule)

    const dayStart = await getScheduleDayStart(env, membership.orgId)
    const nextDue = computeNextDue(orgToday(dayStart), rrule, false)

    const id = crypto.randomUUID()
    const now = isoNow()

    await stub.execute(
      `INSERT INTO asset_inspection_schedule (id, asset_id, form_template_id, label, recurrence_rule, interval_days, next_inspection_due, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      id, data.assetId, data.formTemplateId, label, rrule, intervalDays, nextDue, now, now,
    )

    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.schedule_created', data.assetId, {
        schedule_id: id,
        label,
        form_template_id: data.formTemplateId,
        rrule,
      })
    }

    const scheduleRows = await stub.query(
      `SELECT ${SCHEDULE_SELECT} FROM asset_inspection_schedule ais ${SCHEDULE_JOIN} WHERE ais.id = ?`,
      id,
    ) as ScheduleRow[]

    return { success: true, schedule: rowToScheduleView(scheduleRows[0]!) }
  })

export const updateInspectionScheduleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateInspectionScheduleInput) => d)
  .handler(async (ctx): Promise<UpdateInspectionScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    type ExistingRow = { id: string; asset_id: string; form_template_id: string; label: string; recurrence_rule: string; interval_days: number; is_active: number }
    const existingRows = await stub.query(
      `SELECT ais.id, ais.asset_id, ais.form_template_id, ais.label, ais.recurrence_rule, ais.interval_days, ais.is_active
       FROM asset_inspection_schedule ais
       WHERE ais.id = ? AND ais.asset_id = ?`,
      data.scheduleId, data.assetId,
    ) as ExistingRow[]
    const existing = existingRows[0] ?? null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    // Validate new template if changing
    if (data.formTemplateId && data.formTemplateId !== existing.form_template_id) {
      type TplRow = { id: string; status: string; org_id: string | null; is_system: number }
      const tplRows = await stub.query(
        `SELECT id, status, org_id, is_system FROM form_template WHERE id = ?`,
        data.formTemplateId,
      ) as TplRow[]
      const tpl = tplRows[0] ?? null

      if (!tpl) return { success: false, error: 'TEMPLATE_NOT_FOUND' }
      if (tpl.org_id !== null && tpl.org_id !== membership.orgId && tpl.is_system !== 1) {
        return { success: false, error: 'TEMPLATE_NOT_FOUND' }
      }
      if (tpl.status !== 'published') return { success: false, error: 'TEMPLATE_NOT_PUBLISHED' }
    }

    const newLabel = data.label !== undefined ? data.label.trim() : existing.label
    if (!newLabel || newLabel.length > 200) return { success: false, error: 'INVALID_INPUT' }

    const newTemplateId = data.formTemplateId ?? existing.form_template_id
    const newRRule = data.recurrenceRule ?? existing.recurrence_rule

    if (data.recurrenceRule && !validateInspectionRRule(data.recurrenceRule)) {
      return { success: false, error: 'INVALID_RECURRENCE_RULE' }
    }

    const newIntervalDays = data.recurrenceRule ? rruleToIntervalDays(data.recurrenceRule) : existing.interval_days
    const newIsActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.is_active

    const now = isoNow()

    // Recompute next due if recurrence changed
    let nextDue: string | null = null
    if (newIsActive) {
      nextDue = await recomputeScheduleNextDue(env, membership.orgId, data.scheduleId, newRRule)
    }

    await stub.execute(
      `UPDATE asset_inspection_schedule SET
        form_template_id = ?, label = ?, recurrence_rule = ?, interval_days = ?,
        next_inspection_due = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      newTemplateId, newLabel, newRRule, newIntervalDays, nextDue, newIsActive, now, data.scheduleId,
    )

    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.schedule_updated', data.assetId, {
        schedule_id: data.scheduleId,
        label: newLabel,
      })
    }

    const scheduleRows = await stub.query(
      `SELECT ${SCHEDULE_SELECT} FROM asset_inspection_schedule ais ${SCHEDULE_JOIN} WHERE ais.id = ?`,
      data.scheduleId,
    ) as ScheduleRow[]

    return { success: true, schedule: rowToScheduleView(scheduleRows[0]!) }
  })

export const deleteInspectionScheduleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteInspectionScheduleInput) => d)
  .handler(async (ctx): Promise<DeleteInspectionScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    type ExistingRow = { id: string; label: string }
    const existingRows = await stub.query(
      `SELECT ais.id, ais.label FROM asset_inspection_schedule ais
       WHERE ais.id = ? AND ais.asset_id = ?`,
      data.scheduleId, data.assetId,
    ) as ExistingRow[]
    const existing = existingRows[0] ?? null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    await stub.execute(`DELETE FROM asset_inspection_schedule WHERE id = ?`, data.scheduleId)

    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.schedule_deleted', data.assetId, {
        schedule_id: data.scheduleId,
        label: existing.label,
      })
    }

    return { success: true }
  })

export const getInspectionSchedulesServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetInspectionSchedulesInput) => d)
  .handler(async (ctx): Promise<GetInspectionSchedulesOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    const assetCheckRows = await stub.query(`SELECT id FROM asset WHERE id = ?`, data.assetId) as { id: string }[]
    if (assetCheckRows.length === 0) return { success: false, error: 'NOT_FOUND' }

    const rows = await stub.query(
      `SELECT ${SCHEDULE_SELECT}
       FROM asset_inspection_schedule ais ${SCHEDULE_JOIN}
       WHERE ais.asset_id = ?
       ORDER BY ais.created_at ASC`,
      data.assetId,
    ) as ScheduleRow[]

    return { success: true, schedules: rows.map(rowToScheduleView) }
  })

// ---------------------------------------------------------------------------
// F. Queries / Alerts
// ---------------------------------------------------------------------------

export const getExpiringAssetsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetExpiringAssetsInput) => d)
  .handler(async (ctx): Promise<GetExpiringAssetsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const lookaheadDays = data.lookaheadDays ?? 90
    const dayStart = await getScheduleDayStart(env, membership.orgId)
    const today = orgToday(dayStart)
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + lookaheadDays)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const stub = getOrgStub(env, membership.orgId)
    const rows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT}
       FROM asset a ${ASSET_JOINS}
       WHERE a.expiration_date IS NOT NULL AND a.expiration_date <= ?
         AND a.status != 'decommissioned'
       ORDER BY a.expiration_date ASC`,
      cutoffStr,
    ) as AssetRow[]

    return { success: true, assets: rows.map((r) => rowToAssetView(r, membership.orgId)) }
  })

export const getOverdueInspectionsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetOverdueInspectionsInput) => d)
  .handler(async (ctx): Promise<GetOverdueInspectionsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const lookaheadDays = data.lookaheadDays ?? 7
    const dayStart = await getScheduleDayStart(env, membership.orgId)
    const today = orgToday(dayStart)
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + lookaheadDays)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    type OverdueRow = ScheduleRow & { asset_name: string; asset_type: string }

    const stub = getOrgStub(env, membership.orgId)
    const rows = await stub.query(
      `SELECT ${SCHEDULE_SELECT}, a.name AS asset_name, a.asset_type
       FROM asset_inspection_schedule ais
       ${SCHEDULE_JOIN}
       JOIN asset a ON a.id = ais.asset_id
       WHERE ais.is_active = 1
         AND ais.next_inspection_due IS NOT NULL AND ais.next_inspection_due <= ?
         AND a.status != 'decommissioned'
       ORDER BY ais.next_inspection_due ASC`,
      cutoffStr,
    ) as OverdueRow[]

    const overdueInspections: OverdueInspectionView[] = rows.map((r) => ({
      schedule: rowToScheduleView(r),
      assetName: r.asset_name,
      assetId: r.asset_id,
      assetType: r.asset_type as 'apparatus' | 'gear',
    }))

    return { success: true, overdueInspections }
  })

export const getMyGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetMyGearInput) => d)
  .handler(async (ctx): Promise<GetMyGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    if (!staffRow) return { success: false, error: 'NO_STAFF_RECORD' }

    const rows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT}
       FROM asset a ${ASSET_JOINS}
       WHERE a.assigned_to_staff_id = ?
       ORDER BY a.name ASC`,
      staffRow.id,
    ) as AssetRow[]

    return { success: true, assets: rows.map((r) => rowToAssetView(r, membership.orgId)) }
  })

export const getApparatusGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetApparatusGearInput) => d)
  .handler(async (ctx): Promise<GetApparatusGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    const apparatusRows = await stub.query(
      `SELECT id FROM asset WHERE id = ? AND asset_type = 'apparatus'`,
      data.apparatusId,
    ) as { id: string }[]
    if (apparatusRows.length === 0) return { success: false, error: 'NOT_FOUND' }

    const rows = await stub.query(
      `SELECT ${ASSET_LIST_SELECT}
       FROM asset a ${ASSET_JOINS}
       WHERE a.assigned_to_apparatus_id = ?
       ORDER BY a.name ASC`,
      data.apparatusId,
    ) as AssetRow[]

    return { success: true, assets: rows.map((r) => rowToAssetView(r, membership.orgId)) }
  })

// ---------------------------------------------------------------------------
// G. Audit Log
// ---------------------------------------------------------------------------

export const getAssetAuditLogServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetAssetAuditLogInput) => d)
  .handler(async (ctx): Promise<GetAssetAuditLogOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    const assetCheckRows = await stub.query(`SELECT id FROM asset WHERE id = ?`, data.assetId) as { id: string }[]
    if (assetCheckRows.length === 0) return { success: false, error: 'NOT_FOUND' }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = data.offset ?? 0

    type AuditRow = { id: string; actor_staff_id: string; action: string; asset_id: string; detail_json: string | null; created_at: string; staff_name: string | null }

    const countRows = await stub.query(
      `SELECT COUNT(*) as cnt FROM asset_audit_log WHERE asset_id = ?`,
      data.assetId,
    ) as { cnt: number }[]
    const total = countRows[0]?.cnt ?? 0

    const rows = await stub.query(
      `SELECT al.id, al.actor_staff_id, al.action, al.asset_id, al.detail_json, al.created_at,
              sm.name AS staff_name
       FROM asset_audit_log al
       LEFT JOIN staff_member sm ON sm.id = al.actor_staff_id
       WHERE al.asset_id = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      data.assetId, limit, offset,
    ) as AuditRow[]

    const entries: AssetAuditEntry[] = rows.map((r) => ({
      id: r.id,
      actorStaffId: r.actor_staff_id,
      actorName: r.staff_name ?? null,
      action: r.action,
      assetId: r.asset_id,
      detailJson: r.detail_json ? (JSON.parse(r.detail_json) as Record<string, string | number | boolean | null | object>) : null,
      createdAt: r.created_at,
    }))

    return { success: true, entries, total }
  })

// ---------------------------------------------------------------------------
// I. Asset Locations
// ---------------------------------------------------------------------------

type AssetLocationRow = {
  id: string
  asset_id: string
  name: string
  description: string | null
  sort_order: number
}

function rowToAssetLocationView(r: AssetLocationRow): AssetLocationView {
  return {
    id: r.id,
    assetId: r.asset_id,
    name: r.name,
    description: r.description,
    sortOrder: r.sort_order,
  }
}

export const listAssetLocationsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ListAssetLocationsInput) => d)
  .handler(async (ctx): Promise<ListAssetLocationsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    const assetCheckRows = await stub.query(`SELECT id FROM asset WHERE id = ?`, data.assetId) as { id: string }[]
    if (assetCheckRows.length === 0) return { success: false, error: 'NOT_FOUND' }

    const rows = await stub.query(
      `SELECT id, asset_id, name, description, sort_order FROM asset_location WHERE asset_id = ? ORDER BY sort_order ASC, name ASC`,
      data.assetId,
    ) as AssetLocationRow[]

    return { success: true, locations: rows.map(rowToAssetLocationView) }
  })

export const createAssetLocationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateAssetLocationInput) => d)
  .handler(async (ctx): Promise<CreateAssetLocationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    const assetCheckRows = await stub.query(`SELECT id FROM asset WHERE id = ?`, data.assetId) as { id: string }[]
    if (assetCheckRows.length === 0) return { success: false, error: 'NOT_FOUND' }

    const trimmedName = data.name.trim()
    if (!trimmedName) return { success: false, error: 'DUPLICATE_NAME' }

    // Check for duplicate name on this asset
    const dupRows = await stub.query(
      `SELECT id FROM asset_location WHERE asset_id = ? AND name = ?`,
      data.assetId, trimmedName,
    ) as { id: string }[]
    if (dupRows.length > 0) return { success: false, error: 'DUPLICATE_NAME' }

    const id = crypto.randomUUID()
    const now = isoNow()
    const sortOrder = data.sortOrder ?? 0

    await stub.execute(
      `INSERT INTO asset_location (id, asset_id, name, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, data.assetId, trimmedName, data.description ?? null, sortOrder, now, now,
    )

    return {
      success: true,
      location: { id, assetId: data.assetId, name: trimmedName, description: data.description ?? null, sortOrder },
    }
  })

export const updateAssetLocationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateAssetLocationInput) => d)
  .handler(async (ctx): Promise<UpdateAssetLocationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    const existingRows = await stub.query(
      `SELECT id, asset_id, name, description, sort_order FROM asset_location WHERE id = ? AND asset_id = ?`,
      data.locationId, data.assetId,
    ) as AssetLocationRow[]
    const existing = existingRows[0] ?? null
    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const newName = data.name !== undefined ? data.name.trim() : existing.name
    if (!newName) return { success: false, error: 'DUPLICATE_NAME' }

    // Check for duplicate name (different record)
    if (newName !== existing.name) {
      const dupRows = await stub.query(
        `SELECT id FROM asset_location WHERE asset_id = ? AND name = ? AND id != ?`,
        data.assetId, newName, data.locationId,
      ) as { id: string }[]
      if (dupRows.length > 0) return { success: false, error: 'DUPLICATE_NAME' }
    }

    const newDesc = data.description !== undefined ? data.description : existing.description
    const newSort = data.sortOrder !== undefined ? data.sortOrder : existing.sort_order
    const now = isoNow()

    await stub.execute(
      `UPDATE asset_location SET name = ?, description = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
      newName, newDesc, newSort, now, data.locationId,
    )

    return {
      success: true,
      location: { id: data.locationId, assetId: data.assetId, name: newName, description: newDesc, sortOrder: newSort },
    }
  })

export const deleteAssetLocationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteAssetLocationInput) => d)
  .handler(async (ctx): Promise<DeleteAssetLocationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    const existingRows = await stub.query(
      `SELECT id FROM asset_location WHERE id = ? AND asset_id = ?`,
      data.locationId, data.assetId,
    ) as { id: string }[]
    if (existingRows.length === 0) return { success: false, error: 'NOT_FOUND' }

    // Delete location — FK ON DELETE SET NULL clears assigned_to_location_id on gear
    await stub.execute(`DELETE FROM asset_location WHERE id = ?`, data.locationId)

    return { success: true }
  })
