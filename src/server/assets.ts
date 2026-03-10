import { createServerFn } from '@tanstack/react-start'
import { requireOrgMembership } from '@/server/_helpers'
import { canDo } from '@/lib/rbac'
import type {
  AssetView,
  AssetDetailView,
  InspectionView,
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
  LogInspectionInput,
  LogInspectionOutput,
  GetInspectionHistoryInput,
  GetInspectionHistoryOutput,
  SetInspectionIntervalInput,
  SetInspectionIntervalOutput,
  GetExpiringAssetsInput,
  GetExpiringAssetsOutput,
  GetOverdueInspectionsInput,
  GetOverdueInspectionsOutput,
  GetMyGearInput,
  GetMyGearOutput,
  GetApparatusGearInput,
  GetApparatusGearOutput,
  GetAssetAuditLogInput,
  GetAssetAuditLogOutput,
} from '@/lib/asset.types'

// ---------------------------------------------------------------------------
// Enum constants
// ---------------------------------------------------------------------------

const APPARATUS_CATEGORIES = new Set([
  'engine', 'ladder_truck', 'ambulance_medic', 'battalion_chief', 'rescue',
  'brush_wildland', 'tanker_tender', 'boat', 'atv_utv', 'command_vehicle', 'utility', 'other',
])

const GEAR_CATEGORIES = new Set([
  'scba', 'ppe', 'radio', 'medical_equipment', 'tools', 'hose', 'nozzle',
  'thermal_camera', 'gas_detector', 'lighting', 'extrication', 'rope_rescue',
  'water_rescue', 'hazmat', 'other',
])

const APPARATUS_STATUSES = new Set(['in_service', 'out_of_service', 'reserve', 'decommissioned'])
const GEAR_STATUSES = new Set(['available', 'assigned', 'out_of_service', 'decommissioned', 'expired'])

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isoNow(): string {
  return new Date().toISOString()
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function validateCategory(assetType: string, category: string): boolean {
  if (assetType === 'apparatus') return APPARATUS_CATEGORIES.has(category)
  if (assetType === 'gear') return GEAR_CATEGORIES.has(category)
  return false
}

function validateStatus(assetType: string, status: string): boolean {
  if (assetType === 'apparatus') return APPARATUS_STATUSES.has(status)
  if (assetType === 'gear') return GEAR_STATUSES.has(status)
  return false
}

function validateCustomFields(fields: Record<string, unknown>): boolean {
  for (const val of Object.values(fields)) {
    if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return false
  }
  const json = JSON.stringify(fields)
  return json.length <= 10 * 1024
}

async function writeAssetAuditLog(
  env: Cloudflare.Env,
  opts: {
    orgId: string
    actorStaffId: string
    action: string
    assetId: string
    detail?: Record<string, string | number | boolean | null | undefined | Record<string, unknown>>
  },
): Promise<void> {
  const id = crypto.randomUUID()
  const detailJson = opts.detail ? JSON.stringify(opts.detail) : null
  await env.DB.prepare(
    `INSERT INTO asset_audit_log (id, org_id, actor_staff_id, action, asset_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, opts.orgId, opts.actorStaffId, opts.action, opts.assetId, detailJson, isoNow())
    .run()
}

// Resolve the actor's staff_member id from userId + orgId
async function resolveStaffId(
  env: Cloudflare.Env,
  userId: string,
  orgId: string,
): Promise<string | null> {
  type Row = { id: string }
  const row = await env.DB.prepare(
    `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
  )
    .bind(userId, orgId)
    .first<Row>()
  return row?.id ?? null
}

// ---------------------------------------------------------------------------
// Row → view mappers
// ---------------------------------------------------------------------------

type AssetRow = {
  id: string
  org_id: string
  asset_type: string
  name: string
  category: string
  status: string
  serial_number: string | null
  make: string | null
  model: string | null
  unit_number: string | null
  assigned_to_staff_id: string | null
  assigned_staff_name: string | null
  assigned_to_apparatus_id: string | null
  assigned_apparatus_name: string | null
  expiration_date: string | null
  next_inspection_due: string | null
  created_at: string
  updated_at: string
}

type AssetDetailRow = AssetRow & {
  notes: string | null
  manufacture_date: string | null
  purchased_date: string | null
  in_service_date: string | null
  warranty_expiration_date: string | null
  inspection_interval_days: number | null
  custom_fields: string | null
}

function rowToAssetView(r: AssetRow): AssetView {
  return {
    id: r.id,
    orgId: r.org_id,
    assetType: r.asset_type as 'apparatus' | 'gear',
    name: r.name,
    category: r.category,
    status: r.status,
    serialNumber: r.serial_number,
    make: r.make,
    model: r.model,
    unitNumber: r.unit_number,
    assignedToStaffId: r.assigned_to_staff_id,
    assignedToStaffName: r.assigned_staff_name,
    assignedToApparatusId: r.assigned_to_apparatus_id,
    assignedToApparatusName: r.assigned_apparatus_name,
    expirationDate: r.expiration_date,
    nextInspectionDue: r.next_inspection_due,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToAssetDetailView(r: AssetDetailRow): AssetDetailView {
  const base = rowToAssetView(r)
  let customFields: Record<string, string | number | boolean> | null = null
  if (r.custom_fields) {
    try {
      customFields = JSON.parse(r.custom_fields) as Record<string, string | number | boolean>
    } catch {
      customFields = null
    }
  }
  return {
    ...base,
    notes: r.notes,
    manufactureDate: r.manufacture_date,
    purchasedDate: r.purchased_date,
    inServiceDate: r.in_service_date,
    warrantyExpirationDate: r.warranty_expiration_date,
    inspectionIntervalDays: r.inspection_interval_days,
    customFields,
  }
}

const ASSET_SELECT = `
  a.id, a.org_id, a.asset_type, a.name, a.category, a.status,
  a.serial_number, a.make, a.model, a.unit_number,
  a.assigned_to_staff_id,
  sm.name AS assigned_staff_name,
  a.assigned_to_apparatus_id,
  app.name AS assigned_apparatus_name,
  a.expiration_date, a.next_inspection_due,
  a.created_at, a.updated_at
`

const ASSET_DETAIL_SELECT = `
  a.id, a.org_id, a.asset_type, a.name, a.category, a.status,
  a.serial_number, a.make, a.model, a.unit_number,
  a.assigned_to_staff_id,
  sm.name AS assigned_staff_name,
  a.assigned_to_apparatus_id,
  app.name AS assigned_apparatus_name,
  a.expiration_date, a.next_inspection_due,
  a.created_at, a.updated_at,
  a.notes, a.manufacture_date, a.purchased_date, a.in_service_date,
  a.warranty_expiration_date, a.inspection_interval_days, a.custom_fields
`

const ASSET_JOINS = `
  LEFT JOIN staff_member sm ON sm.id = a.assigned_to_staff_id
  LEFT JOIN asset app ON app.id = a.assigned_to_apparatus_id
`

// ---------------------------------------------------------------------------
// T006: createAssetServerFn
// ---------------------------------------------------------------------------

export const createAssetServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateAssetInput) => d)
  .handler(async (ctx): Promise<CreateAssetOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    // Validate name
    if (!data.name || data.name.trim().length === 0 || data.name.length > 200) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    // Validate category
    if (!validateCategory(data.assetType, data.category)) {
      return { success: false, error: 'INVALID_CATEGORY' }
    }

    // Apparatus requires unit_number
    if (data.assetType === 'apparatus' && !data.unitNumber) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    // Default status
    const status = data.status ?? (data.assetType === 'apparatus' ? 'in_service' : 'available')
    if (!validateStatus(data.assetType, status)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    // Validate custom fields
    if (data.customFields && !validateCustomFields(data.customFields)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    const id = crypto.randomUUID()
    const now = isoNow()
    const customFieldsJson = data.customFields ? JSON.stringify(data.customFields) : null

    try {
      await env.DB.prepare(
        `INSERT INTO asset (
          id, org_id, asset_type, name, category, status,
          serial_number, make, model, notes,
          manufacture_date, purchased_date, in_service_date, expiration_date, warranty_expiration_date,
          custom_fields, unit_number,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id, membership.orgId, data.assetType, data.name.trim(), data.category, status,
          data.serialNumber ?? null, data.make ?? null, data.model ?? null, data.notes ?? null,
          data.manufactureDate ?? null, data.purchasedDate ?? null, data.inServiceDate ?? null,
          data.expirationDate ?? null, data.warrantyExpirationDate ?? null,
          customFieldsJson, data.unitNumber ?? null,
          now, now,
        )
        .run()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('idx_asset_org_unit')) return { success: false, error: 'DUPLICATE_UNIT_NUMBER' }
      if (msg.includes('idx_asset_org_serial')) return { success: false, error: 'DUPLICATE_SERIAL_NUMBER' }
      throw e
    }

    // Write audit log — need actor staff id
    const actorStaffId = await resolveStaffId(env, membership.userId, membership.orgId)
    if (actorStaffId) {
      await writeAssetAuditLog(env, {
        orgId: membership.orgId,
        actorStaffId,
        action: 'asset.created',
        assetId: id,
      })
    }

    // Return the created asset
    const row = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(id)
      .first<AssetRow>()

    if (!row) return { success: false, error: 'UNAUTHORIZED' }
    return { success: true, asset: rowToAssetView(row) }
  })

// ---------------------------------------------------------------------------
// T007: listAssetsServerFn
// ---------------------------------------------------------------------------

export const listAssetsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ListAssetsInput) => d)
  .handler(async (ctx): Promise<ListAssetsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = data.offset ?? 0

    const conditions: string[] = ['a.org_id = ?']
    const binds: unknown[] = [membership.orgId]

    if (data.assetType) {
      conditions.push('a.asset_type = ?')
      binds.push(data.assetType)
    }
    if (data.status) {
      conditions.push('a.status = ?')
      binds.push(data.status)
    }
    if (data.category) {
      conditions.push('a.category = ?')
      binds.push(data.category)
    }
    if (data.assignedToStaffId) {
      conditions.push('a.assigned_to_staff_id = ?')
      binds.push(data.assignedToStaffId)
    }
    if (data.assignedToApparatusId) {
      conditions.push('a.assigned_to_apparatus_id = ?')
      binds.push(data.assignedToApparatusId)
    }
    if (data.search) {
      const term = `%${data.search}%`
      conditions.push('(a.name LIKE ? OR a.unit_number LIKE ? OR a.serial_number LIKE ?)')
      binds.push(term, term, term)
    }

    const where = conditions.join(' AND ')

    type CountRow = { total: number }
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM asset a ${ASSET_JOINS} WHERE ${where}`,
    )
      .bind(...binds)
      .first<CountRow>()
    const total = countRow?.total ?? 0

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE ${where}
       ORDER BY a.name ASC
       LIMIT ? OFFSET ?`,
    )
      .bind(...binds, limit, offset)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView), total }
  })

// ---------------------------------------------------------------------------
// T008: getAssetServerFn
// ---------------------------------------------------------------------------

export const getAssetServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetAssetInput) => d)
  .handler(async (ctx): Promise<GetAssetOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_DETAIL_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.id = ? AND a.org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetDetailRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, asset: rowToAssetDetailView(row) }
  })

// ---------------------------------------------------------------------------
// T012: getMyGearServerFn
// ---------------------------------------------------------------------------

export const getMyGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetMyGearInput) => d)
  .handler(async (ctx): Promise<GetMyGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const staffId = await resolveStaffId(env, membership.userId, membership.orgId)
    if (!staffId) return { success: false, error: 'NO_STAFF_RECORD' }

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.assigned_to_staff_id = ? AND a.org_id = ?
       ORDER BY a.name ASC`,
    )
      .bind(staffId, membership.orgId)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView) }
  })

// ---------------------------------------------------------------------------
// T013: getApparatusGearServerFn
// ---------------------------------------------------------------------------

export const getApparatusGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetApparatusGearInput) => d)
  .handler(async (ctx): Promise<GetApparatusGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    // Verify apparatus exists
    type CheckRow = { id: string }
    const check = await env.DB.prepare(
      `SELECT id FROM asset WHERE id = ? AND org_id = ? AND asset_type = 'apparatus'`,
    )
      .bind(data.apparatusId, membership.orgId)
      .first<CheckRow>()
    if (!check) return { success: false, error: 'NOT_FOUND' }

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.assigned_to_apparatus_id = ? AND a.org_id = ?
       ORDER BY a.name ASC`,
    )
      .bind(data.apparatusId, membership.orgId)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView) }
  })

// ---------------------------------------------------------------------------
// T016: assignGearServerFn
// ---------------------------------------------------------------------------

export const assignGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: AssignGearInput) => d)
  .handler(async (ctx): Promise<AssignGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    // Validate exactly one target
    if (!data.assignToStaffId && !data.assignToApparatusId) {
      return { success: false, error: 'INVALID_INPUT' }
    }
    if (data.assignToStaffId && data.assignToApparatusId) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    type GearRow = {
      id: string; asset_type: string; status: string;
      assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null
    }
    const asset = await env.DB.prepare(
      `SELECT id, asset_type, status, assigned_to_staff_id, assigned_to_apparatus_id
       FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<GearRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }
    if (asset.asset_type !== 'gear') return { success: false, error: 'NOT_GEAR' }
    if (asset.status === 'decommissioned') return { success: false, error: 'DECOMMISSIONED' }
    if (asset.status === 'expired') return { success: false, error: 'EXPIRED' }

    // Validate target exists
    if (data.assignToStaffId) {
      type StaffRow = { id: string }
      const staffCheck = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
      )
        .bind(data.assignToStaffId, membership.orgId)
        .first<StaffRow>()
      if (!staffCheck) return { success: false, error: 'INVALID_TARGET' }
    }

    if (data.assignToApparatusId) {
      type AppRow = { id: string }
      const appCheck = await env.DB.prepare(
        `SELECT id FROM asset WHERE id = ? AND org_id = ? AND asset_type = 'apparatus' AND status != 'decommissioned'`,
      )
        .bind(data.assignToApparatusId, membership.orgId)
        .first<AppRow>()
      if (!appCheck) return { success: false, error: 'INVALID_TARGET' }
    }

    const actorStaffId = await resolveStaffId(env, membership.userId, membership.orgId)
    const now = isoNow()

    // Write unassigned audit if was previously assigned
    const wasAssigned = asset.assigned_to_staff_id || asset.assigned_to_apparatus_id
    if (wasAssigned && actorStaffId) {
      await writeAssetAuditLog(env, {
        orgId: membership.orgId,
        actorStaffId,
        action: 'asset.unassigned',
        assetId: data.assetId,
        detail: {
          previousStaffId: asset.assigned_to_staff_id,
          previousApparatusId: asset.assigned_to_apparatus_id,
        },
      })
    }

    // Update assignment
    await env.DB.prepare(
      `UPDATE asset SET
         assigned_to_staff_id = ?,
         assigned_to_apparatus_id = ?,
         status = 'assigned',
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        data.assignToStaffId ?? null,
        data.assignToApparatusId ?? null,
        now,
        data.assetId,
      )
      .run()

    if (actorStaffId) {
      await writeAssetAuditLog(env, {
        orgId: membership.orgId,
        actorStaffId,
        action: 'asset.assigned',
        assetId: data.assetId,
        detail: {
          assignedToStaffId: data.assignToStaffId ?? null,
          assignedToApparatusId: data.assignToApparatusId ?? null,
        },
      })
    }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, asset: rowToAssetView(row) }
  })

// ---------------------------------------------------------------------------
// T018: logInspectionServerFn
// ---------------------------------------------------------------------------

export const logInspectionServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: LogInspectionInput) => d)
  .handler(async (ctx): Promise<LogInspectionOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (data.result !== 'pass' && data.result !== 'fail') {
      return { success: false, error: 'INVALID_INPUT' }
    }

    type AssetInfoRow = {
      id: string; org_id: string; status: string;
      asset_type: string; assigned_to_staff_id: string | null;
      inspection_interval_days: number | null;
    }
    const asset = await env.DB.prepare(
      `SELECT id, org_id, status, asset_type, assigned_to_staff_id, inspection_interval_days
       FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetInfoRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }

    // Permission check: manage-assets OR (gear assigned to current user's staff member)
    const canManage = canDo(membership.role, 'manage-assets')
    if (!canManage) {
      const staffId = await resolveStaffId(env, membership.userId, membership.orgId)
      const isAssignedStaff = asset.asset_type === 'gear' && asset.assigned_to_staff_id && staffId === asset.assigned_to_staff_id
      if (!isAssignedStaff) return { success: false, error: 'FORBIDDEN' }
    }

    const actorStaffId = await resolveStaffId(env, membership.userId, membership.orgId)
    if (!actorStaffId) return { success: false, error: 'FORBIDDEN' }

    const inspectionDate = data.inspectionDate ?? isoDateToday()
    const inspectionId = crypto.randomUUID()
    const now = isoNow()

    await env.DB.prepare(
      `INSERT INTO asset_inspection (id, org_id, asset_id, inspector_staff_id, result, notes, inspection_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(inspectionId, membership.orgId, data.assetId, actorStaffId, data.result, data.notes ?? null, inspectionDate, now)
      .run()

    // Recalculate next_inspection_due if interval is set
    if (asset.inspection_interval_days) {
      const nextDue = addDays(inspectionDate, asset.inspection_interval_days)
      await env.DB.prepare(
        `UPDATE asset SET next_inspection_due = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(nextDue, now, data.assetId)
        .run()
    }

    await writeAssetAuditLog(env, {
      orgId: membership.orgId,
      actorStaffId,
      action: 'asset.inspected',
      assetId: data.assetId,
      detail: { result: data.result, inspectionDate },
    })

    // Build inspector name
    type StaffNameRow = { name: string }
    const staffName = await env.DB.prepare(`SELECT name FROM staff_member WHERE id = ?`)
      .bind(actorStaffId)
      .first<StaffNameRow>()

    const inspection: InspectionView = {
      id: inspectionId,
      assetId: data.assetId,
      inspectorStaffId: actorStaffId,
      inspectorName: staffName?.name ?? 'Unknown',
      result: data.result,
      notes: data.notes ?? null,
      inspectionDate,
      createdAt: now,
    }

    return { success: true, inspection }
  })

// ---------------------------------------------------------------------------
// T020: unassignGearServerFn
// ---------------------------------------------------------------------------

export const unassignGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UnassignGearInput) => d)
  .handler(async (ctx): Promise<UnassignGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    type GearRow = {
      id: string; asset_type: string; status: string;
      assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null
    }
    const asset = await env.DB.prepare(
      `SELECT id, asset_type, status, assigned_to_staff_id, assigned_to_apparatus_id
       FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<GearRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }
    if (!asset.assigned_to_staff_id && !asset.assigned_to_apparatus_id) {
      return { success: false, error: 'NOT_ASSIGNED' }
    }

    const actorStaffId = await resolveStaffId(env, membership.userId, membership.orgId)
    const now = isoNow()

    // Status reverts to 'available' unless out_of_service
    const newStatus = asset.status === 'out_of_service' ? 'out_of_service' : 'available'

    await env.DB.prepare(
      `UPDATE asset SET
         assigned_to_staff_id = NULL,
         assigned_to_apparatus_id = NULL,
         status = ?,
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(newStatus, now, data.assetId)
      .run()

    if (actorStaffId) {
      await writeAssetAuditLog(env, {
        orgId: membership.orgId,
        actorStaffId,
        action: 'asset.unassigned',
        assetId: data.assetId,
        detail: {
          previousStaffId: asset.assigned_to_staff_id,
          previousApparatusId: asset.assigned_to_apparatus_id,
        },
      })
    }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, asset: rowToAssetView(row) }
  })

// ---------------------------------------------------------------------------
// T022: changeAssetStatusServerFn
// ---------------------------------------------------------------------------

export const changeAssetStatusServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ChangeAssetStatusInput) => d)
  .handler(async (ctx): Promise<ChangeAssetStatusOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    type AssetInfoRow = {
      id: string; asset_type: string; status: string;
    }
    const asset = await env.DB.prepare(
      `SELECT id, asset_type, status FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetInfoRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }
    if (asset.status === 'decommissioned') return { success: false, error: 'DECOMMISSIONED' }
    if (!validateStatus(asset.asset_type, data.newStatus)) return { success: false, error: 'INVALID_STATUS' }

    const actorStaffId = await resolveStaffId(env, membership.userId, membership.orgId)
    const now = isoNow()
    const oldStatus = asset.status

    await env.DB.prepare(
      `UPDATE asset SET status = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(data.newStatus, now, data.assetId)
      .run()

    // Side effects on decommission
    if (data.newStatus === 'decommissioned') {
      if (asset.asset_type === 'apparatus') {
        // Unassign all gear assigned to this apparatus
        type GearAssignedRow = { id: string }
        const gearRows = await env.DB.prepare(
          `SELECT id FROM asset WHERE assigned_to_apparatus_id = ? AND org_id = ?`,
        )
          .bind(data.assetId, membership.orgId)
          .all<GearAssignedRow>()

        for (const gear of gearRows.results ?? []) {
          await env.DB.prepare(
            `UPDATE asset SET assigned_to_apparatus_id = NULL, status = 'available', updated_at = ? WHERE id = ?`,
          )
            .bind(now, gear.id)
            .run()
          if (actorStaffId) {
            await writeAssetAuditLog(env, {
              orgId: membership.orgId,
              actorStaffId,
              action: 'asset.unassigned',
              assetId: gear.id,
              detail: { reason: 'apparatus_decommissioned', apparatusId: data.assetId },
            })
          }
        }
      } else if (asset.asset_type === 'gear') {
        // Clear assignment if exists
        type AssignRow = { assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null }
        const assignRow = await env.DB.prepare(
          `SELECT assigned_to_staff_id, assigned_to_apparatus_id FROM asset WHERE id = ?`,
        )
          .bind(data.assetId)
          .first<AssignRow>()
        if (assignRow && (assignRow.assigned_to_staff_id || assignRow.assigned_to_apparatus_id)) {
          await env.DB.prepare(
            `UPDATE asset SET assigned_to_staff_id = NULL, assigned_to_apparatus_id = NULL, updated_at = ? WHERE id = ?`,
          )
            .bind(now, data.assetId)
            .run()
        }
      }
    }

    if (actorStaffId) {
      await writeAssetAuditLog(env, {
        orgId: membership.orgId,
        actorStaffId,
        action: 'asset.status_changed',
        assetId: data.assetId,
        detail: { oldStatus, newStatus: data.newStatus },
      })
    }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, asset: rowToAssetView(row) }
  })

// ---------------------------------------------------------------------------
// T023: updateAssetServerFn
// ---------------------------------------------------------------------------

export const updateAssetServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateAssetInput) => d)
  .handler(async (ctx): Promise<UpdateAssetOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    type AssetInfoRow = { id: string; asset_type: string; status: string; category: string }
    const asset = await env.DB.prepare(
      `SELECT id, asset_type, status, category FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetInfoRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }
    if (asset.status === 'decommissioned') return { success: false, error: 'DECOMMISSIONED' }

    if (data.name !== undefined && (data.name.trim().length === 0 || data.name.length > 200)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    if (data.category !== undefined && !validateCategory(asset.asset_type, data.category)) {
      return { success: false, error: 'INVALID_CATEGORY' }
    }

    if (data.customFields !== undefined && data.customFields !== null && !validateCustomFields(data.customFields)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    const now = isoNow()
    const setClauses: string[] = []
    const binds: unknown[] = []

    const track: Record<string, unknown> = {}

    if (data.name !== undefined) { setClauses.push('name = ?'); binds.push(data.name.trim()); track.name = data.name.trim() }
    if (data.category !== undefined) { setClauses.push('category = ?'); binds.push(data.category); track.category = data.category }
    if ('serialNumber' in data) { setClauses.push('serial_number = ?'); binds.push(data.serialNumber ?? null); track.serialNumber = data.serialNumber ?? null }
    if ('make' in data) { setClauses.push('make = ?'); binds.push(data.make ?? null); track.make = data.make ?? null }
    if ('model' in data) { setClauses.push('model = ?'); binds.push(data.model ?? null); track.model = data.model ?? null }
    if ('notes' in data) { setClauses.push('notes = ?'); binds.push(data.notes ?? null) }
    if ('manufactureDate' in data) { setClauses.push('manufacture_date = ?'); binds.push(data.manufactureDate ?? null) }
    if ('purchasedDate' in data) { setClauses.push('purchased_date = ?'); binds.push(data.purchasedDate ?? null) }
    if ('inServiceDate' in data) { setClauses.push('in_service_date = ?'); binds.push(data.inServiceDate ?? null) }
    if ('expirationDate' in data) { setClauses.push('expiration_date = ?'); binds.push(data.expirationDate ?? null) }
    if ('warrantyExpirationDate' in data) { setClauses.push('warranty_expiration_date = ?'); binds.push(data.warrantyExpirationDate ?? null) }
    if ('customFields' in data) { setClauses.push('custom_fields = ?'); binds.push(data.customFields ? JSON.stringify(data.customFields) : null) }
    if (data.unitNumber !== undefined && asset.asset_type === 'apparatus') {
      setClauses.push('unit_number = ?')
      binds.push(data.unitNumber)
      track.unitNumber = data.unitNumber
    }

    if (setClauses.length === 0) {
      // Nothing to update — return current asset
      const row = await env.DB.prepare(
        `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
      )
        .bind(data.assetId)
        .first<AssetRow>()
      if (!row) return { success: false, error: 'NOT_FOUND' }
      return { success: true, asset: rowToAssetView(row) }
    }

    setClauses.push('updated_at = ?')
    binds.push(now, data.assetId)

    try {
      await env.DB.prepare(
        `UPDATE asset SET ${setClauses.join(', ')} WHERE id = ?`,
      )
        .bind(...binds)
        .run()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('idx_asset_org_unit')) return { success: false, error: 'DUPLICATE_UNIT_NUMBER' }
      if (msg.includes('idx_asset_org_serial')) return { success: false, error: 'DUPLICATE_SERIAL_NUMBER' }
      throw e
    }

    const actorStaffId = await resolveStaffId(env, membership.userId, membership.orgId)
    if (actorStaffId) {
      await writeAssetAuditLog(env, {
        orgId: membership.orgId,
        actorStaffId,
        action: 'asset.updated',
        assetId: data.assetId,
        detail: { changed: track },
      })
    }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, asset: rowToAssetView(row) }
  })

// ---------------------------------------------------------------------------
// T025: setInspectionIntervalServerFn
// ---------------------------------------------------------------------------

export const setInspectionIntervalServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: SetInspectionIntervalInput) => d)
  .handler(async (ctx): Promise<SetInspectionIntervalOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    if (data.intervalDays !== null && (!Number.isInteger(data.intervalDays) || data.intervalDays <= 0)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    type CheckRow = { id: string }
    const check = await env.DB.prepare(
      `SELECT id FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<CheckRow>()
    if (!check) return { success: false, error: 'NOT_FOUND' }

    const now = isoNow()
    let nextDue: string | null = null

    if (data.intervalDays !== null) {
      // Find most recent inspection date
      type LastRow = { inspection_date: string }
      const lastInspection = await env.DB.prepare(
        `SELECT inspection_date FROM asset_inspection
         WHERE asset_id = ?
         ORDER BY inspection_date DESC
         LIMIT 1`,
      )
        .bind(data.assetId)
        .first<LastRow>()

      const baseDate = lastInspection?.inspection_date ?? isoDateToday()
      nextDue = addDays(baseDate, data.intervalDays)
    }

    await env.DB.prepare(
      `UPDATE asset SET inspection_interval_days = ?, next_inspection_due = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(data.intervalDays, nextDue, now, data.assetId)
      .run()

    const row = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, asset: rowToAssetView(row) }
  })

// ---------------------------------------------------------------------------
// T027: getInspectionHistoryServerFn
// ---------------------------------------------------------------------------

export const getInspectionHistoryServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetInspectionHistoryInput) => d)
  .handler(async (ctx): Promise<GetInspectionHistoryOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type CheckRow = { id: string }
    const check = await env.DB.prepare(
      `SELECT id FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<CheckRow>()
    if (!check) return { success: false, error: 'NOT_FOUND' }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = data.offset ?? 0

    type CountRow = { total: number }
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM asset_inspection WHERE asset_id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<CountRow>()
    const total = countRow?.total ?? 0

    type InspRow = {
      id: string; asset_id: string; inspector_staff_id: string;
      staff_name: string | null; result: string; notes: string | null;
      inspection_date: string; created_at: string;
    }
    const rows = await env.DB.prepare(
      `SELECT i.id, i.asset_id, i.inspector_staff_id,
              sm.name AS staff_name,
              i.result, i.notes, i.inspection_date, i.created_at
       FROM asset_inspection i
       LEFT JOIN staff_member sm ON sm.id = i.inspector_staff_id
       WHERE i.asset_id = ? AND i.org_id = ?
       ORDER BY i.inspection_date DESC, i.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(data.assetId, membership.orgId, limit, offset)
      .all<InspRow>()

    const inspections: InspectionView[] = (rows.results ?? []).map((r) => ({
      id: r.id,
      assetId: r.asset_id,
      inspectorStaffId: r.inspector_staff_id,
      inspectorName: r.staff_name ?? 'Unknown',
      result: r.result as 'pass' | 'fail',
      notes: r.notes,
      inspectionDate: r.inspection_date,
      createdAt: r.created_at,
    }))

    return { success: true, inspections, total }
  })

// ---------------------------------------------------------------------------
// T028: getAssetAuditLogServerFn
// ---------------------------------------------------------------------------

export const getAssetAuditLogServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetAssetAuditLogInput) => d)
  .handler(async (ctx): Promise<GetAssetAuditLogOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type CheckRow = { id: string }
    const check = await env.DB.prepare(
      `SELECT id FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<CheckRow>()
    if (!check) return { success: false, error: 'NOT_FOUND' }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = data.offset ?? 0

    type CountRow = { total: number }
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM asset_audit_log WHERE asset_id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<CountRow>()
    const total = countRow?.total ?? 0

    type AuditRow = {
      id: string; actor_staff_id: string; staff_name: string | null;
      action: string; asset_id: string; detail_json: string | null; created_at: string;
    }
    const rows = await env.DB.prepare(
      `SELECT al.id, al.actor_staff_id,
              sm.name AS staff_name,
              al.action, al.asset_id, al.detail_json, al.created_at
       FROM asset_audit_log al
       LEFT JOIN staff_member sm ON sm.id = al.actor_staff_id
       WHERE al.asset_id = ? AND al.org_id = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(data.assetId, membership.orgId, limit, offset)
      .all<AuditRow>()

    const entries: AssetAuditEntry[] = (rows.results ?? []).map((r) => {
      let detailJson: Record<string, string | number | boolean | object> | null = null
      if (r.detail_json) {
        try {
          detailJson = JSON.parse(r.detail_json) as Record<string, string | number | boolean | object>
        } catch {
          detailJson = null
        }
      }
      return {
        id: r.id,
        actorStaffId: r.actor_staff_id,
        actorName: r.staff_name,
        action: r.action,
        assetId: r.asset_id,
        detailJson,
        createdAt: r.created_at,
      }
    })

    return { success: true, entries, total }
  })

// ---------------------------------------------------------------------------
// T030: getExpiringAssetsServerFn
// ---------------------------------------------------------------------------

export const getExpiringAssetsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetExpiringAssetsInput) => d)
  .handler(async (ctx): Promise<GetExpiringAssetsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const lookaheadDays = data.lookaheadDays ?? 90
    const cutoff = addDays(isoDateToday(), lookaheadDays)

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.org_id = ?
         AND a.status != 'decommissioned'
         AND a.expiration_date IS NOT NULL
         AND a.expiration_date <= ?
       ORDER BY a.expiration_date ASC`,
    )
      .bind(membership.orgId, cutoff)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView) }
  })

// ---------------------------------------------------------------------------
// T031: getOverdueInspectionsServerFn
// ---------------------------------------------------------------------------

export const getOverdueInspectionsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetOverdueInspectionsInput) => d)
  .handler(async (ctx): Promise<GetOverdueInspectionsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const lookaheadDays = data.lookaheadDays ?? 7
    const cutoff = addDays(isoDateToday(), lookaheadDays)

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.org_id = ?
         AND a.status != 'decommissioned'
         AND a.next_inspection_due IS NOT NULL
         AND a.next_inspection_due <= ?
       ORDER BY a.next_inspection_due ASC`,
    )
      .bind(membership.orgId, cutoff)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView) }
  })
