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
  EditInspectionInput,
  EditInspectionOutput,
  DeleteInspectionInput,
  DeleteInspectionOutput,
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

async function recomputeNextDueFromHistory(
  env: Cloudflare.Env,
  orgId: string,
  assetId: string,
  intervalDays: number,
  rule: RecurrenceRule | null,
): Promise<string> {
  type InspRow = { inspection_date: string }
  const lastInsp = await env.DB.prepare(
    `SELECT inspection_date FROM asset_inspection
     WHERE asset_id = ? AND org_id = ?
     ORDER BY inspection_date DESC, created_at DESC LIMIT 1`,
  ).bind(assetId, orgId).first<InspRow>()

  const dayStart = await getScheduleDayStart(env, orgId)
  const base = lastInsp ? lastInsp.inspection_date : orgToday(dayStart)

  if (rule) return computeNextDue(base, rule, !!lastInsp)
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + intervalDays)
  return d.toISOString().slice(0, 10)
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
  inspection_recurrence_rule: string | null
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
    expirationDate: r.expiration_date,
    nextInspectionDue: r.next_inspection_due,
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
    inspectionIntervalDays: r.inspection_interval_days,
    inspectionRecurrenceRule: r.inspection_recurrence_rule
      ? (JSON.parse(r.inspection_recurrence_rule) as RecurrenceRule)
      : null,
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
  a.expiration_date, a.next_inspection_due,
  a.created_at, a.updated_at`

const ASSET_DETAIL_SELECT = `
  a.id, a.org_id, a.asset_type, a.name, a.category, a.status,
  a.serial_number, a.make, a.model, a.unit_number,
  a.assigned_to_staff_id,
  sm.name AS assigned_to_staff_name,
  a.assigned_to_apparatus_id,
  app.name AS assigned_to_apparatus_name,
  a.expiration_date, a.next_inspection_due,
  a.created_at, a.updated_at,
  a.notes, a.manufacture_date, a.purchased_date, a.in_service_date,
  a.warranty_expiration_date, a.inspection_interval_days, a.inspection_recurrence_rule, a.custom_fields`

const ASSET_JOINS = `
  LEFT JOIN staff_member sm ON sm.id = a.assigned_to_staff_id
  LEFT JOIN asset app ON app.id = a.assigned_to_apparatus_id`

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
        env.DB.prepare(`UPDATE asset SET assigned_to_apparatus_id = NULL, status = 'available', updated_at = ? WHERE assigned_to_apparatus_id = ? AND org_id = ?`)
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
        `UPDATE asset SET status = ?, assigned_to_staff_id = NULL, assigned_to_apparatus_id = NULL, updated_at = ? WHERE id = ? AND org_id = ?`,
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

    const now = isoNow()
    const wasPreviouslyAssigned = asset.assigned_to_staff_id || asset.assigned_to_apparatus_id

    await env.DB.prepare(
      `UPDATE asset SET assigned_to_staff_id = ?, assigned_to_apparatus_id = ?, status = 'assigned', updated_at = ? WHERE id = ?`,
    )
      .bind(
        data.assignToStaffId || null,
        data.assignToApparatusId || null,
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
      `UPDATE asset SET assigned_to_staff_id = NULL, assigned_to_apparatus_id = NULL, status = ?, updated_at = ? WHERE id = ?`,
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
// D. Inspections
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

    type AssetBasicRow = { id: string; asset_type: string; assigned_to_staff_id: string | null; inspection_interval_days: number | null; inspection_recurrence_rule: string | null }
    const asset = await env.DB.prepare(
      `SELECT id, asset_type, assigned_to_staff_id, inspection_interval_days, inspection_recurrence_rule FROM asset WHERE id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<AssetBasicRow>()

    if (!asset) return { success: false, error: 'NOT_FOUND' }

    // Permission: manage-assets OR assigned staff member
    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.userId, membership.orgId)
      .first<StaffRow>()

    const hasManageAssets = canDo(membership.role, 'manage-assets')
    const isAssignedStaff = staffRow && asset.assigned_to_staff_id === staffRow.id

    if (!hasManageAssets && !isAssignedStaff) return { success: false, error: 'FORBIDDEN' }
    if (!staffRow) return { success: false, error: 'FORBIDDEN' }

    const dayStart = await getScheduleDayStart(env, membership.orgId)
    const inspectionDate = data.inspectionDate ?? orgToday(dayStart)
    const id = crypto.randomUUID()
    const now = isoNow()

    await env.DB.prepare(
      `INSERT INTO asset_inspection (id, org_id, asset_id, inspector_staff_id, result, notes, inspection_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, membership.orgId, asset.id, staffRow.id, data.result, data.notes?.trim() || null, inspectionDate, now)
      .run()

    // Recalculate next_inspection_due if a schedule is set
    if (asset.inspection_interval_days) {
      let nextDueStr: string
      const rule = asset.inspection_recurrence_rule
        ? (JSON.parse(asset.inspection_recurrence_rule) as RecurrenceRule)
        : null
      if (rule) {
        nextDueStr = computeNextDue(inspectionDate, rule, true)
      } else {
        const nextDue = new Date(inspectionDate + 'T00:00:00Z')
        nextDue.setUTCDate(nextDue.getUTCDate() + asset.inspection_interval_days)
        nextDueStr = nextDue.toISOString().slice(0, 10)
      }
      await env.DB.prepare(`UPDATE asset SET next_inspection_due = ?, updated_at = ? WHERE id = ?`)
        .bind(nextDueStr, now, asset.id)
        .run()
    }

    await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.inspected', asset.id, {
      result: data.result,
      inspection_date: inspectionDate,
    })

    type InspRow = { id: string; asset_id: string; inspector_staff_id: string; result: string; notes: string | null; inspection_date: string; created_at: string; staff_name: string | null }
    const row = await env.DB.prepare(
      `SELECT ai.*, sm.name AS staff_name FROM asset_inspection ai
       LEFT JOIN staff_member sm ON sm.id = ai.inspector_staff_id
       WHERE ai.id = ?`,
    )
      .bind(id)
      .first<InspRow>()

    const inspection: InspectionView = {
      id: row!.id,
      assetId: row!.asset_id,
      inspectorStaffId: row!.inspector_staff_id,
      inspectorName: row!.staff_name ?? 'Unknown',
      result: row!.result as 'pass' | 'fail',
      notes: row!.notes,
      inspectionDate: row!.inspection_date,
      createdAt: row!.created_at,
    }

    return { success: true, inspection }
  })

export const getInspectionHistoryServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: GetInspectionHistoryInput) => d)
  .handler(async (ctx): Promise<GetInspectionHistoryOutput> => {
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
      `SELECT COUNT(*) as cnt FROM asset_inspection WHERE asset_id = ? AND org_id = ?`,
    )
      .bind(data.assetId, membership.orgId)
      .first<{ cnt: number }>()
    const total = countRow?.cnt ?? 0

    type InspRow = { id: string; asset_id: string; inspector_staff_id: string; result: string; notes: string | null; inspection_date: string; created_at: string; staff_name: string | null }
    const rows = await env.DB.prepare(
      `SELECT ai.id, ai.asset_id, ai.inspector_staff_id, ai.result, ai.notes, ai.inspection_date, ai.created_at,
              sm.name AS staff_name
       FROM asset_inspection ai
       LEFT JOIN staff_member sm ON sm.id = ai.inspector_staff_id
       WHERE ai.asset_id = ? AND ai.org_id = ?
       ORDER BY ai.inspection_date DESC, ai.created_at DESC
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
// E. Inspection Scheduling
// ---------------------------------------------------------------------------

export const setInspectionIntervalServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: SetInspectionIntervalInput) => d)
  .handler(async (ctx): Promise<SetInspectionIntervalOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-assets')) return { success: false, error: 'FORBIDDEN' }

    const rule = data.recurrenceRule
    const hasRule = rule !== null
    const intervalDays = hasRule
      ? ({ daily: 1, weekly: 7, monthly: 30, quarterly: 90, semi_annual: 182, annual: 365 }[rule.freq])
      : data.intervalDays

    if (!hasRule && intervalDays !== null && (!Number.isInteger(intervalDays) || intervalDays < 1)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    const asset = await env.DB.prepare(`SELECT id FROM asset WHERE id = ? AND org_id = ?`)
      .bind(data.assetId, membership.orgId)
      .first<{ id: string }>()
    if (!asset) return { success: false, error: 'NOT_FOUND' }

    let nextDue: string | null = null
    if (intervalDays !== null) {
      type InspRow = { inspection_date: string }
      const lastInsp = await env.DB.prepare(
        `SELECT inspection_date FROM asset_inspection WHERE asset_id = ? ORDER BY inspection_date DESC LIMIT 1`,
      )
        .bind(data.assetId)
        .first<InspRow>()

      const dayStart = await getScheduleDayStart(env, membership.orgId)
      const baseDate = lastInsp ? lastInsp.inspection_date : orgToday(dayStart)

      if (rule) {
        nextDue = computeNextDue(baseDate, rule, !!lastInsp)
      } else {
        const due = new Date(baseDate + 'T00:00:00Z')
        due.setUTCDate(due.getUTCDate() + intervalDays)
        nextDue = due.toISOString().slice(0, 10)
      }
    }

    const ruleJson = rule ? JSON.stringify(rule) : null
    const now = isoNow()
    await env.DB.prepare(
      `UPDATE asset SET inspection_interval_days = ?, inspection_recurrence_rule = ?, next_inspection_due = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(intervalDays, ruleJson, nextDue, now, data.assetId)
      .run()

    const row = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS} WHERE a.id = ?`,
    )
      .bind(data.assetId)
      .first<AssetRow>()

    return { success: true, asset: rowToAssetView(row!) }
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

    const rows = await env.DB.prepare(
      `SELECT ${ASSET_LIST_SELECT} FROM asset a ${ASSET_JOINS}
       WHERE a.org_id = ? AND a.next_inspection_due IS NOT NULL AND a.next_inspection_due <= ?
         AND a.status != 'decommissioned'
       ORDER BY a.next_inspection_due ASC`,
    )
      .bind(membership.orgId, cutoffStr)
      .all<AssetRow>()

    return { success: true, assets: (rows.results ?? []).map(rowToAssetView) }
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
// H. Edit / Delete Inspections
// ---------------------------------------------------------------------------

export const editInspectionServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: EditInspectionInput) => d)
  .handler(async (ctx): Promise<EditInspectionOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (data.result !== 'pass' && data.result !== 'fail') {
      return { success: false, error: 'INVALID_INPUT' }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.inspectionDate)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    ).bind(membership.userId, membership.orgId).first<StaffRow>()

    if (!staffRow) return { success: false, error: 'FORBIDDEN' }

    type InspRow = {
      id: string; asset_id: string; inspector_staff_id: string
      result: string; notes: string | null; inspection_date: string; created_at: string
    }
    const insp = await env.DB.prepare(
      `SELECT ai.id, ai.asset_id, ai.inspector_staff_id, ai.result, ai.notes,
              ai.inspection_date, ai.created_at
       FROM asset_inspection ai
       JOIN asset a ON a.id = ai.asset_id
       WHERE ai.id = ? AND ai.asset_id = ? AND a.org_id = ?`,
    ).bind(data.inspectionId, data.assetId, membership.orgId).first<InspRow>()

    if (!insp) return { success: false, error: 'NOT_FOUND' }

    const canManage = canDo(membership.role, 'manage-assets')
    if (!canManage && staffRow.id !== insp.inspector_staff_id) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const changes: Record<string, unknown> = {}
    if (data.result !== insp.result) changes['result'] = { from: insp.result, to: data.result }
    if (data.inspectionDate !== insp.inspection_date) changes['inspection_date'] = { from: insp.inspection_date, to: data.inspectionDate }
    if ((data.notes ?? null) !== insp.notes) changes['notes'] = { from: insp.notes, to: data.notes }

    const now = isoNow()
    await env.DB.prepare(
      `UPDATE asset_inspection SET result = ?, notes = ?, inspection_date = ? WHERE id = ?`,
    ).bind(data.result, data.notes, data.inspectionDate, insp.id).run()

    type AssetIntervalRow = { inspection_interval_days: number | null; inspection_recurrence_rule: string | null }
    const assetRow = await env.DB.prepare(
      `SELECT inspection_interval_days, inspection_recurrence_rule FROM asset WHERE id = ?`,
    ).bind(insp.asset_id).first<AssetIntervalRow>()

    if (assetRow?.inspection_interval_days) {
      const rule = assetRow.inspection_recurrence_rule
        ? (JSON.parse(assetRow.inspection_recurrence_rule) as RecurrenceRule)
        : null
      const nextDue = await recomputeNextDueFromHistory(env, membership.orgId, insp.asset_id, assetRow.inspection_interval_days, rule)
      await env.DB.prepare(`UPDATE asset SET next_inspection_due = ?, updated_at = ? WHERE id = ?`)
        .bind(nextDue, now, insp.asset_id).run()
    }

    await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.inspection_edited', insp.asset_id, {
      inspection_id: insp.id,
      ...changes,
    })

    type InspJoinRow = { id: string; asset_id: string; inspector_staff_id: string; result: string; notes: string | null; inspection_date: string; created_at: string; staff_name: string | null }
    const row = await env.DB.prepare(
      `SELECT ai.id, ai.asset_id, ai.inspector_staff_id, ai.result, ai.notes, ai.inspection_date, ai.created_at,
              sm.name AS staff_name
       FROM asset_inspection ai
       LEFT JOIN staff_member sm ON sm.id = ai.inspector_staff_id
       WHERE ai.id = ?`,
    ).bind(insp.id).first<InspJoinRow>()

    const inspection: InspectionView = {
      id: row!.id,
      assetId: row!.asset_id,
      inspectorStaffId: row!.inspector_staff_id,
      inspectorName: row!.staff_name ?? 'Unknown',
      result: row!.result as 'pass' | 'fail',
      notes: row!.notes,
      inspectionDate: row!.inspection_date,
      createdAt: row!.created_at,
    }

    return { success: true, inspection }
  })

export const deleteInspectionServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteInspectionInput) => d)
  .handler(async (ctx): Promise<DeleteInspectionOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE user_id = ? AND org_id = ? AND status != 'removed' LIMIT 1`,
    ).bind(membership.userId, membership.orgId).first<StaffRow>()

    if (!staffRow) return { success: false, error: 'FORBIDDEN' }

    type InspRow = {
      id: string; asset_id: string; inspector_staff_id: string
      result: string; inspection_date: string
    }
    const insp = await env.DB.prepare(
      `SELECT ai.id, ai.asset_id, ai.inspector_staff_id, ai.result, ai.inspection_date
       FROM asset_inspection ai
       JOIN asset a ON a.id = ai.asset_id
       WHERE ai.id = ? AND ai.asset_id = ? AND a.org_id = ?`,
    ).bind(data.inspectionId, data.assetId, membership.orgId).first<InspRow>()

    if (!insp) return { success: false, error: 'NOT_FOUND' }

    const canManage = canDo(membership.role, 'manage-assets')
    if (!canManage && staffRow.id !== insp.inspector_staff_id) {
      return { success: false, error: 'FORBIDDEN' }
    }

    await env.DB.prepare(`DELETE FROM asset_inspection WHERE id = ?`).bind(insp.id).run()

    const now = isoNow()
    type AssetIntervalRow = { inspection_interval_days: number | null; inspection_recurrence_rule: string | null }
    const assetRow = await env.DB.prepare(
      `SELECT inspection_interval_days, inspection_recurrence_rule FROM asset WHERE id = ?`,
    ).bind(insp.asset_id).first<AssetIntervalRow>()

    if (assetRow?.inspection_interval_days) {
      const rule = assetRow.inspection_recurrence_rule
        ? (JSON.parse(assetRow.inspection_recurrence_rule) as RecurrenceRule)
        : null
      const nextDue = await recomputeNextDueFromHistory(env, membership.orgId, insp.asset_id, assetRow.inspection_interval_days, rule)
      await env.DB.prepare(`UPDATE asset SET next_inspection_due = ?, updated_at = ? WHERE id = ?`)
        .bind(nextDue, now, insp.asset_id).run()
    }

    await writeAssetAuditLog(env, membership.orgId, staffRow.id, 'asset.inspection_deleted', insp.asset_id, {
      inspection_id: insp.id,
      inspection_date: insp.inspection_date,
      result: insp.result,
    })

    return { success: true }
  })
