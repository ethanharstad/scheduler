import { createServerFn } from '@tanstack/react-start'
import { requireOrgMembership } from '@/server/_helpers'
import { canDo } from '@/lib/rbac'
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
  RecurrenceRule,
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
  const row = await env.DB.prepare(`SELECT schedule_day_start FROM organization WHERE id = ?`)
    .bind(orgId)
    .first<{ schedule_day_start: string }>()
  return row?.schedule_day_start ?? '00:00'
}

// Compute the next inspection due date from a base date and recurrence rule.
// When advance=true (post-inspection), always goes one full period forward.
// When advance=false (initial setup), finds the soonest upcoming occurrence.
function computeNextDue(base: string, rule: RecurrenceRule, advance: boolean): string {
  const baseDate = new Date(base + 'T00:00:00Z')

  if (rule.freq === 'daily') {
    return new Date(baseDate.getTime() + 86400000).toISOString().slice(0, 10)
  }

  if (rule.freq === 'weekly') {
    const dow = rule.dayOfWeek ?? 5 // default Friday
    let diff = (dow - baseDate.getUTCDay() + 7) % 7
    if (diff === 0) diff = 7 // strictly after base
    return new Date(baseDate.getTime() + diff * 86400000).toISOString().slice(0, 10)
  }

  // monthly, quarterly, semi_annual, annual
  const dom = Math.min(rule.dayOfMonth ?? baseDate.getUTCDate(), 28)
  const monthStep =
    rule.freq === 'monthly' ? 1 : rule.freq === 'quarterly' ? 3 : rule.freq === 'semi_annual' ? 6 : 12

  let year = baseDate.getUTCFullYear()
  let month = baseDate.getUTCMonth()

  if (!advance) {
    // Try current month first — use it if the day hasn't passed yet
    const candidate = new Date(Date.UTC(year, month, dom))
    if (candidate > baseDate) {
      return candidate.toISOString().slice(0, 10)
    }
  }

  // Advance one period forward
  month += monthStep
  year += Math.floor(month / 12)
  month = ((month % 12) + 12) % 12
  return new Date(Date.UTC(year, month, dom)).toISOString().slice(0, 10)
}

async function recomputeScheduleNextDue(
  env: Cloudflare.Env,
  orgId: string,
  scheduleId: string,
  rule: RecurrenceRule,
): Promise<string> {
  type SubRow = { submitted_at: string }
  const lastSub = await env.DB.prepare(
    `SELECT submitted_at FROM form_submission
     WHERE schedule_id = ? AND org_id = ? AND status = 'complete'
     ORDER BY submitted_at DESC LIMIT 1`,
  ).bind(scheduleId, orgId).first<SubRow>()

  const dayStart = await getScheduleDayStart(env, orgId)
  const base = lastSub ? lastSub.submitted_at.slice(0, 10) : orgToday(dayStart)
  return computeNextDue(base, rule, !!lastSub)
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
  const id = crypto.randomUUID()
  const now = isoNow()
  const detailJson = detail ? JSON.stringify(detail) : null
  await env.DB.prepare(
    `INSERT INTO asset_audit_log (id, org_id, actor_staff_id, action, asset_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, orgId, actorStaffId, action, assetId, detailJson, now)
    .run()
}

// ---------------------------------------------------------------------------
// Row → view mapping helpers
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

function rowToAssetDetailView(r: AssetDetailRow): AssetDetailView {
  return {
    ...rowToAssetView(r),
    notes: r.notes,
    manufactureDate: r.manufacture_date,
    purchasedDate: r.purchased_date,
    inServiceDate: r.in_service_date,
    warrantyExpirationDate: r.warranty_expiration_date,
    customFields: r.custom_fields ? (JSON.parse(r.custom_fields) as Record<string, string | number | boolean>) : null,
  }
}

const ASSET_LIST_SELECT = `
  a.id, a.org_id, a.asset_type, a.name, a.category, a.status,
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
  a.id, a.org_id, a.asset_type, a.name, a.category, a.status,
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
    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.userId, membership.orgId)
      .first<StaffRow>()

    const id = crypto.randomUUID()
    const now = isoNow()
    const customFieldsJson = data.customFields ? JSON.stringify(data.customFields) : null

    try {
      await env.DB.prepare(
        `INSERT INTO asset (
          id, org_id, asset_type, name, category, status,
          serial_number, make, model, notes,
          manufacture_date, purchased_date, in_service_date, expiration_date, warranty_expiration_date,
          custom_fields, unit_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          membership.orgId,
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
        .run()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('idx_asset_org_unit')) return { success: false, error: 'DUPLICATE_UNIT_NUMBER' }
      if (msg.includes('idx_asset_org_serial')) return { success: false, error: 'DUPLICATE_SERIAL_NUMBER' }
      throw e
    }

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.created', id)
    }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(id)
      .first<AssetRow>()

    return { success: true, asset: rowToAssetView(row!) }
  })

export const updateAssetServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateAssetInput) => d)
  .handler(async (ctx): Promise<UpdateAssetOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    type AssetBasicRow = { id: string; org_id: string; asset_type: string; status: string; name: string; category: string; serial_number: string | null; make: string | null; model: string | null; unit_number: string | null; notes: string | null; manufacture_date: string | null; purchased_date: string | null; in_service_date: string | null; expiration_date: string | null; warranty_expiration_date: string | null; custom_fields: string | null }
    const existing = await env.DB.prepare(
      `SELECT id, org_id, asset_type, status, name, category, serial_number, make, model, unit_number, notes, manufacture_date, purchased_date, in_service_date, expiration_date, warranty_expiration_date, custom_fields FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetBasicRow>()

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
      await env.DB.prepare(
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
        WHERE id = ? AND org_id = ?`,
      )
        .bind(
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
          membership.orgId,
        )
        .run()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('idx_asset_org_unit')) return { success: false, error: 'DUPLICATE_UNIT_NUMBER' }
      if (msg.includes('idx_asset_org_serial')) return { success: false, error: 'DUPLICATE_SERIAL_NUMBER' }
      throw e
    }

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.userId, membership.orgId)
      .first<StaffRow>()

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.updated', data.assetId, changes)
    }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    return { success: true, asset: rowToAssetView(row!) }
  })

export const getAssetServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetAssetInput) => d)
  .handler(async (ctx): Promise<GetAssetOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_DETAIL_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ? AND a.org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetDetailRow>()

    if (!row) return { success: false, error: 'NOT_FOUND' }
    return { success: true, asset: rowToAssetDetailView(row) }
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

    const conditions: string[] = ['a.org_id = ?']
    const bindings: unknown[] = [membership.orgId]

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

    const where = conditions.join(' AND ')

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM asset a WHERE ${where}`,
    )
      .bind(...bindings)
      .first<{ cnt: number }>()
    const total = countRow?.cnt ?? 0

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...bindings, limit, offset)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView), total }
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

    type AssetBasicRow = { id: string; org_id: string; asset_type: string; status: string; assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null }
    const asset = await env.DB.prepare(
      `SELECT id, org_id, asset_type, status, assigned_to_staff_id, assigned_to_apparatus_id FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetBasicRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }
    if (asset.status === 'decommissioned') return { success: false, error: 'DECOMMISSIONED' }
    if (!validateStatus(asset.asset_type as 'apparatus' | 'gear', data.newStatus)) {
      return { success: false, error: 'INVALID_STATUS' }
    }

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.userId, membership.orgId)
      .first<StaffRow>()

    const now = isoNow()
    const oldStatus = asset.status

    if (data.newStatus === 'decommissioned' && asset.asset_type === 'apparatus') {
      // Unassign all gear from this apparatus
      type GearRow = { id: string }
      const gearRows = await env.DB.prepare(
        `SELECT id FROM asset WHERE assigned_to_apparatus_id = ? AND org_id = ?`,
      )
        .bind(asset.id, membership.orgId)
        .all<GearRow>()

      const stmts = [
        env.DB.prepare(`UPDATE asset SET assigned_to_apparatus_id = NULL, assigned_to_location_id = NULL, status = 'available', updated_at = ? WHERE assigned_to_apparatus_id = ? AND org_id = ?`)
          .bind(now, asset.id, membership.orgId),
        env.DB.prepare(`UPDATE asset SET status = ?, updated_at = ? WHERE id = ? AND org_id = ?`)
          .bind(data.newStatus, now, asset.id, membership.orgId),
      ]
      await env.DB.batch(stmts)

      if (staffRow) {
        await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.status_changed', asset.id, { from: oldStatus, to: data.newStatus })
        for (const gear of gearRows.results ?? []) {
          await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.unassigned', gear.id, { reason: 'apparatus_decommissioned' })
        }
      }
    } else if (data.newStatus === 'decommissioned' && asset.asset_type === 'gear') {
      // Clear assignment if exists
      await env.DB.prepare(
        `UPDATE asset SET status = ?, assigned_to_staff_id = NULL, assigned_to_apparatus_id = NULL, assigned_to_location_id = NULL, updated_at = ? WHERE id = ? AND org_id = ?`,
      )
        .bind(data.newStatus, now, asset.id, membership.orgId)
        .run()

      if (staffRow) {
        if (asset.assigned_to_staff_id || asset.assigned_to_apparatus_id) {
          await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.unassigned', asset.id, { reason: 'gear_decommissioned' })
        }
        await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.status_changed', asset.id, { from: oldStatus, to: data.newStatus })
      }
    } else {
      await env.DB.prepare(`UPDATE asset SET status = ?, updated_at = ? WHERE id = ? AND org_id = ?`)
        .bind(data.newStatus, now, asset.id, membership.orgId)
        .run()

      if (staffRow) {
        await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.status_changed', asset.id, { from: oldStatus, to: data.newStatus })
      }
    }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    return { success: true, asset: rowToAssetView(row!) }
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

    type AssetBasicRow = { id: string; org_id: string; asset_type: string; status: string; assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null }
    const asset = await env.DB.prepare(
      `SELECT id, org_id, asset_type, status, assigned_to_staff_id, assigned_to_apparatus_id FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetBasicRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }
    if (asset.asset_type !== 'gear') return { success: false, error: 'NOT_GEAR' }
    if (asset.status === 'decommissioned') return { success: false, error: 'DECOMMISSIONED' }
    if (asset.status === 'expired') return { success: false, error: 'EXPIRED' }

    type StaffRow = { id: string }
    const actorStaffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.userId, membership.orgId)
      .first<StaffRow>()

    // Validate target exists
    if (data.assignToStaffId) {
      const targetStaff = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
      )
        .bind(data.assignToStaffId, membership.orgId)
        .first<{ id: string }>()
      if (!targetStaff) return { success: false, error: 'INVALID_TARGET' }
    }

    if (data.assignToApparatusId) {
      const targetApp = await env.DB.prepare(
        `SELECT id FROM asset WHERE id = ? AND org_id = ? AND asset_type = 'apparatus'`,
      )
        .bind(data.assignToApparatusId, membership.orgId)
        .first<{ id: string }>()
      if (!targetApp) return { success: false, error: 'INVALID_TARGET' }
    }

    // Validate optional location belongs to the target asset
    const locationId = data.assignToLocationId || null
    if (locationId) {
      const targetAssetId = data.assignToApparatusId || data.assignToStaffId
      if (!targetAssetId) return { success: false, error: 'INVALID_INPUT' }
      // Location must belong to the apparatus being assigned to
      if (!data.assignToApparatusId) return { success: false, error: 'INVALID_INPUT' }
      const loc = await env.DB.prepare(
        `SELECT id FROM asset_location WHERE id = ? AND asset_id = ?`,
      )
        .bind(locationId, data.assignToApparatusId)
        .first<{ id: string }>()
      if (!loc) return { success: false, error: 'INVALID_TARGET' }
    }

    const now = isoNow()
    const wasPreviouslyAssigned = asset.assigned_to_staff_id || asset.assigned_to_apparatus_id

    await env.DB.prepare(
      `UPDATE asset SET assigned_to_staff_id = ?, assigned_to_apparatus_id = ?, assigned_to_location_id = ?, status = 'assigned', updated_at = ? WHERE id = ?`,
    )
      .bind(
        data.assignToStaffId || null,
        data.assignToApparatusId || null,
        locationId,
        now,
        asset.id,
      )
      .run()

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

    const row = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    return { success: true, asset: rowToAssetView(row!) }
  })

export const unassignGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UnassignGearInput) => d)
  .handler(async (ctx): Promise<UnassignGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    type AssetBasicRow = { id: string; asset_type: string; status: string; assigned_to_staff_id: string | null; assigned_to_apparatus_id: string | null }
    const asset = await env.DB.prepare(
      `SELECT id, asset_type, status, assigned_to_staff_id, assigned_to_apparatus_id FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetBasicRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }

    const isAssigned = asset.assigned_to_staff_id || asset.assigned_to_apparatus_id
    if (!isAssigned) return { success: false, error: 'NOT_ASSIGNED' }

    // Revert to 'available' unless out_of_service/decommissioned
    const newStatus = asset.status === 'out_of_service' || asset.status === 'decommissioned'
      ? asset.status
      : 'available'

    const now = isoNow()
    await env.DB.prepare(
      `UPDATE asset SET assigned_to_staff_id = NULL, assigned_to_apparatus_id = NULL, assigned_to_location_id = NULL, status = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(newStatus, now, asset.id)
      .run()

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.userId, membership.orgId)
      .first<StaffRow>()

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.unassigned', asset.id, {
        from_staff_id: asset.assigned_to_staff_id,
        from_apparatus_id: asset.assigned_to_apparatus_id,
      })
    }

    const row = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    return { success: true, asset: rowToAssetView(row!) }
  })

// ---------------------------------------------------------------------------
// D. Inspection Schedules
// ---------------------------------------------------------------------------

const FREQ_TO_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, monthly: 30, quarterly: 90, semi_annual: 182, annual: 365,
}

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
    recurrenceRule: JSON.parse(r.recurrence_rule) as RecurrenceRule,
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

    const asset = await env.DB.prepare(`SELECT id FROM asset WHERE id = ? AND org_id = ?`)
      .bind(data.assetId, membership.orgId)
      .first<{ id: string }>()
    if (!asset) return { success: false, error: 'NOT_FOUND' }

    // Validate form template exists, belongs to org (or is system), and is published
    type TplRow = { id: string; status: string; org_id: string | null; is_system: number }
    const tpl = await env.DB.prepare(
      `SELECT id, status, org_id, is_system FROM form_template WHERE id = ?`,
    ).bind(data.formTemplateId).first<TplRow>()

    if (!tpl) return { success: false, error: 'TEMPLATE_NOT_FOUND' }
    if (tpl.org_id !== null && tpl.org_id !== membership.orgId && tpl.is_system !== 1) {
      return { success: false, error: 'TEMPLATE_NOT_FOUND' }
    }
    if (tpl.status !== 'published') return { success: false, error: 'TEMPLATE_NOT_PUBLISHED' }

    const rule = data.recurrenceRule
    const intervalDays = FREQ_TO_DAYS[rule.freq] ?? 30

    const dayStart = await getScheduleDayStart(env, membership.orgId)
    const nextDue = computeNextDue(orgToday(dayStart), rule, false)

    const id = crypto.randomUUID()
    const now = isoNow()
    const ruleJson = JSON.stringify(rule)

    await env.DB.prepare(
      `INSERT INTO asset_inspection_schedule (id, org_id, asset_id, form_template_id, label, recurrence_rule, interval_days, next_inspection_due, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(id, membership.orgId, data.assetId, data.formTemplateId, label, ruleJson, intervalDays, nextDue, now, now).run()

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    ).bind(membership.userId, membership.orgId).first<StaffRow>()

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.schedule_created', data.assetId, {
        schedule_id: id,
        label,
        form_template_id: data.formTemplateId,
        freq: rule.freq,
      })
    }

    const row = await env.DB.prepare(
      `SELECT ${SCHEDULE_SELECT} FROM asset_inspection_schedule ais ${SCHEDULE_JOIN} WHERE ais.id = ?`,
    ).bind(id).first<ScheduleRow>()

    return { success: true, schedule: rowToScheduleView(row!) }
  })

export const updateInspectionScheduleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateInspectionScheduleInput) => d)
  .handler(async (ctx): Promise<UpdateInspectionScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    type ExistingRow = { id: string; asset_id: string; form_template_id: string; label: string; recurrence_rule: string; interval_days: number; is_active: number }
    const existing = await env.DB.prepare(
      `SELECT ais.id, ais.asset_id, ais.form_template_id, ais.label, ais.recurrence_rule, ais.interval_days, ais.is_active
       FROM asset_inspection_schedule ais
       JOIN asset a ON a.id = ais.asset_id
       WHERE ais.id = ? AND ais.asset_id = ? AND a.org_id = ?`,
    ).bind(data.scheduleId, data.assetId, membership.orgId).first<ExistingRow>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    // Validate new template if changing
    if (data.formTemplateId && data.formTemplateId !== existing.form_template_id) {
      type TplRow = { id: string; status: string; org_id: string | null; is_system: number }
      const tpl = await env.DB.prepare(
        `SELECT id, status, org_id, is_system FROM form_template WHERE id = ?`,
      ).bind(data.formTemplateId).first<TplRow>()

      if (!tpl) return { success: false, error: 'TEMPLATE_NOT_FOUND' }
      if (tpl.org_id !== null && tpl.org_id !== membership.orgId && tpl.is_system !== 1) {
        return { success: false, error: 'TEMPLATE_NOT_FOUND' }
      }
      if (tpl.status !== 'published') return { success: false, error: 'TEMPLATE_NOT_PUBLISHED' }
    }

    const newLabel = data.label !== undefined ? data.label.trim() : existing.label
    if (!newLabel || newLabel.length > 200) return { success: false, error: 'INVALID_INPUT' }

    const newTemplateId = data.formTemplateId ?? existing.form_template_id
    const newRule = data.recurrenceRule ?? (JSON.parse(existing.recurrence_rule) as RecurrenceRule)
    const newIntervalDays = data.recurrenceRule ? (FREQ_TO_DAYS[data.recurrenceRule.freq] ?? 30) : existing.interval_days
    const newIsActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.is_active

    const now = isoNow()
    const ruleJson = JSON.stringify(newRule)

    // Recompute next due if recurrence changed
    let nextDue: string | null = null
    if (newIsActive) {
      nextDue = await recomputeScheduleNextDue(env, membership.orgId, data.scheduleId, newRule)
    }

    await env.DB.prepare(
      `UPDATE asset_inspection_schedule SET
        form_template_id = ?, label = ?, recurrence_rule = ?, interval_days = ?,
        next_inspection_due = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(newTemplateId, newLabel, ruleJson, newIntervalDays, nextDue, newIsActive, now, data.scheduleId).run()

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    ).bind(membership.userId, membership.orgId).first<StaffRow>()

    if (staffRow) {
      await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.schedule_updated', data.assetId, {
        schedule_id: data.scheduleId,
        label: newLabel,
      })
    }

    const row = await env.DB.prepare(
      `SELECT ${SCHEDULE_SELECT} FROM asset_inspection_schedule ais ${SCHEDULE_JOIN} WHERE ais.id = ?`,
    ).bind(data.scheduleId).first<ScheduleRow>()

    return { success: true, schedule: rowToScheduleView(row!) }
  })

export const deleteInspectionScheduleServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteInspectionScheduleInput) => d)
  .handler(async (ctx): Promise<DeleteInspectionScheduleOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    type ExistingRow = { id: string; label: string }
    const existing = await env.DB.prepare(
      `SELECT ais.id, ais.label FROM asset_inspection_schedule ais
       JOIN asset a ON a.id = ais.asset_id
       WHERE ais.id = ? AND ais.asset_id = ? AND a.org_id = ?`,
    ).bind(data.scheduleId, data.assetId, membership.orgId).first<ExistingRow>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    await env.DB.prepare(`DELETE FROM asset_inspection_schedule WHERE id = ?`).bind(data.scheduleId).run()

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    ).bind(membership.userId, membership.orgId).first<StaffRow>()

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

    const assetCheck = await env.DB.prepare(`SELECT id FROM asset WHERE id = ? AND org_id = ?`)
      .bind(data.assetId, membership.orgId)
      .first<{ id: string }>()
    if (!assetCheck) return { success: false, error: 'NOT_FOUND' }

    const rows = await env.DB.prepare(
      `SELECT ${SCHEDULE_SELECT} FROM asset_inspection_schedule ais ${SCHEDULE_JOIN}
       WHERE ais.asset_id = ? AND ais.org_id = ?
       ORDER BY ais.created_at ASC`,
    ).bind(data.assetId, membership.orgId).all<ScheduleRow>()

    return { success: true, schedules: (rows.results ?? []).map(rowToScheduleView) }
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

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.org_id = ? AND a.expiration_date IS NOT NULL AND a.expiration_date <= ?
         AND a.status != 'decommissioned'
       ORDER BY a.expiration_date ASC`,
    )
      .bind(membership.orgId, cutoffStr)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView) }
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
    const rows = await env.DB.prepare(
      `SELECT ${SCHEDULE_SELECT}, a.name AS asset_name, a.asset_type
       FROM asset_inspection_schedule ais
       ${SCHEDULE_JOIN}
       JOIN asset a ON a.id = ais.asset_id
       WHERE ais.org_id = ? AND ais.is_active = 1
         AND ais.next_inspection_due IS NOT NULL AND ais.next_inspection_due <= ?
         AND a.status != 'decommissioned'
       ORDER BY ais.next_inspection_due ASC`,
    )
      .bind(membership.orgId, cutoffStr)
      .all<OverdueRow>()

    const overdueInspections: OverdueInspectionView[] = (rows.results ?? []).map((r) => ({
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

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.userId, membership.orgId)
      .first<StaffRow>()

    if (!staffRow) return { success: false, error: 'NO_STAFF_RECORD' }

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.assigned_to_staff_id = ? AND a.org_id = ?
       ORDER BY a.name ASC`,
    )
      .bind(staffRow.id, membership.orgId)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView) }
  })

export const getApparatusGearServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetApparatusGearInput) => d)
  .handler(async (ctx): Promise<GetApparatusGearOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const apparatus = await env.DB.prepare(
      `SELECT id FROM asset WHERE id = ? AND org_id = ? AND asset_type = 'apparatus'`,
    )
      .bind(data.apparatusId, membership.orgId)
      .first<{ id: string }>()
    if (!apparatus) return { success: false, error: 'NOT_FOUND' }

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.assigned_to_apparatus_id = ? AND a.org_id = ?
       ORDER BY a.name ASC`,
    )
      .bind(data.apparatusId, membership.orgId)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView) }
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

    const assetCheck = await env.DB.prepare(`SELECT id FROM asset WHERE id = ? AND org_id = ?`)
      .bind(data.assetId, membership.orgId)
      .first<{ id: string }>()
    if (!assetCheck) return { success: false, error: 'NOT_FOUND' }

    const limit = Math.min(data.limit ?? 50, 200)
    const offset = data.offset ?? 0

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM asset_audit_log WHERE asset_id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<{ cnt: number }>()
    const total = countRow?.cnt ?? 0

    type AuditRow = { id: string; actor_staff_id: string; action: string; asset_id: string; detail_json: string | null; created_at: string; staff_name: string | null }
    const rows = await env.DB.prepare(
      `SELECT al.id, al.actor_staff_id, al.action, al.asset_id, al.detail_json, al.created_at,
              sm.name AS staff_name
       FROM asset_audit_log al
       LEFT JOIN staff_member sm ON sm.id = al.actor_staff_id
       WHERE al.asset_id = ? AND al.org_id = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(data.assetId, membership.orgId, limit, offset)
      .all<AuditRow>()

    const entries: AssetAuditEntry[] = (rows.results ?? []).map((r) => ({
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

    const assetCheck = await env.DB.prepare(`SELECT id FROM asset WHERE id = ? AND org_id = ?`)
      .bind(data.assetId, membership.orgId)
      .first<{ id: string }>()
    if (!assetCheck) return { success: false, error: 'NOT_FOUND' }

    const rows = await env.DB.prepare(
      `SELECT id, asset_id, name, description, sort_order FROM asset_location WHERE asset_id = ? AND org_id = ? ORDER BY sort_order ASC, name ASC`,
    )
      .bind(data.assetId, membership.orgId)
      .all<AssetLocationRow>()

    return { success: true, locations: (rows.results ?? []).map(rowToAssetLocationView) }
  })

export const createAssetLocationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateAssetLocationInput) => d)
  .handler(async (ctx): Promise<CreateAssetLocationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const assetCheck = await env.DB.prepare(`SELECT id FROM asset WHERE id = ? AND org_id = ?`)
      .bind(data.assetId, membership.orgId)
      .first<{ id: string }>()
    if (!assetCheck) return { success: false, error: 'NOT_FOUND' }

    const trimmedName = data.name.trim()
    if (!trimmedName) return { success: false, error: 'DUPLICATE_NAME' }

    // Check for duplicate name on this asset
    const dup = await env.DB.prepare(
      `SELECT id FROM asset_location WHERE asset_id = ? AND name = ?`,
    )
      .bind(data.assetId, trimmedName)
      .first<{ id: string }>()
    if (dup) return { success: false, error: 'DUPLICATE_NAME' }

    const id = crypto.randomUUID()
    const now = isoNow()
    const sortOrder = data.sortOrder ?? 0

    await env.DB.prepare(
      `INSERT INTO asset_location (id, org_id, asset_id, name, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, membership.orgId, data.assetId, trimmedName, data.description ?? null, sortOrder, now, now)
      .run()

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

    const existing = await env.DB.prepare(
      `SELECT id, asset_id, name, description, sort_order FROM asset_location WHERE id = ? AND asset_id = ? AND org_id = ?`,
    )
      .bind(data.locationId, data.assetId, membership.orgId)
      .first<AssetLocationRow>()
    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const newName = data.name !== undefined ? data.name.trim() : existing.name
    if (!newName) return { success: false, error: 'DUPLICATE_NAME' }

    // Check for duplicate name (different record)
    if (newName !== existing.name) {
      const dup = await env.DB.prepare(
        `SELECT id FROM asset_location WHERE asset_id = ? AND name = ? AND id != ?`,
      )
        .bind(data.assetId, newName, data.locationId)
        .first<{ id: string }>()
      if (dup) return { success: false, error: 'DUPLICATE_NAME' }
    }

    const newDesc = data.description !== undefined ? data.description : existing.description
    const newSort = data.sortOrder !== undefined ? data.sortOrder : existing.sort_order
    const now = isoNow()

    await env.DB.prepare(
      `UPDATE asset_location SET name = ?, description = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(newName, newDesc, newSort, now, data.locationId)
      .run()

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

    const existing = await env.DB.prepare(
      `SELECT id FROM asset_location WHERE id = ? AND asset_id = ? AND org_id = ?`,
    )
      .bind(data.locationId, data.assetId, membership.orgId)
      .first<{ id: string }>()
    if (!existing) return { success: false, error: 'NOT_FOUND' }

    // Delete location — FK ON DELETE SET NULL clears assigned_to_location_id on gear
    await env.DB.prepare(`DELETE FROM asset_location WHERE id = ?`)
      .bind(data.locationId)
      .run()

    return { success: true }
  })
