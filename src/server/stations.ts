import { createServerFn } from '@tanstack/react-start'
import { canDo } from '@/lib/rbac'
import type {
  StationView,
  ListStationsInput,
  ListStationsOutput,
  CreateStationInput,
  CreateStationOutput,
  UpdateStationInput,
  UpdateStationOutput,
  DeleteStationInput,
  DeleteStationOutput,
} from '@/lib/station.types'
import { requireOrgMembership } from '@/server/_helpers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StationRow = {
  id: string
  org_id: string
  name: string
  code: string | null
  address: string | null
  status: string
  sort_order: number
  created_at: string
  updated_at: string
}

function toView(row: StationRow): StationView {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    status: row.status as StationView['status'],
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// listStationsServerFn
// ---------------------------------------------------------------------------

export const listStationsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListStationsInput) => d)
  .handler(async (ctx): Promise<ListStationsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const rows = await env.DB.prepare(
      `SELECT id, org_id, name, code, address, status, sort_order, created_at, updated_at
       FROM station
       WHERE org_id = ?
       ORDER BY sort_order ASC, LOWER(name) ASC`,
    )
      .bind(membership.orgId)
      .all<StationRow>()

    return { success: true, stations: (rows.results ?? []).map(toView) }
  })

// ---------------------------------------------------------------------------
// createStationServerFn
// ---------------------------------------------------------------------------

export const createStationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateStationInput) => d)
  .handler(async (ctx): Promise<CreateStationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-stations')) return { success: false, error: 'FORBIDDEN' }

    const name = data.name.trim()
    if (name.length < 2 || name.length > 100) {
      return { success: false, error: 'VALIDATION_ERROR', message: 'Name must be 2-100 characters' }
    }

    const code = data.code?.trim() || null
    if (code && (code.length < 1 || code.length > 20)) {
      return { success: false, error: 'VALIDATION_ERROR', message: 'Code must be 1-20 characters' }
    }

    const address = data.address?.trim() || null
    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    try {
      await env.DB.prepare(
        `INSERT INTO station (id, org_id, name, code, address, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
      )
        .bind(id, membership.orgId, name, code, address, now, now)
        .run()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('idx_station_org_name')) {
        return { success: false, error: 'DUPLICATE_NAME', message: 'A station with this name already exists' }
      }
      if (msg.includes('idx_station_org_code')) {
        return { success: false, error: 'DUPLICATE_CODE', message: 'A station with this code already exists' }
      }
      throw err
    }

    const row = await env.DB.prepare(
      `SELECT id, org_id, name, code, address, status, sort_order, created_at, updated_at
       FROM station WHERE id = ?`,
    )
      .bind(id)
      .first<StationRow>()

    return { success: true, station: toView(row!) }
  })

// ---------------------------------------------------------------------------
// updateStationServerFn
// ---------------------------------------------------------------------------

export const updateStationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateStationInput) => d)
  .handler(async (ctx): Promise<UpdateStationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-stations')) return { success: false, error: 'FORBIDDEN' }

    const existing = await env.DB.prepare(
      `SELECT id FROM station WHERE id = ? AND org_id = ?`,
    )
      .bind(data.stationId, membership.orgId)
      .first<{ id: string }>()
    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const sets: string[] = []
    const binds: unknown[] = []

    if (data.name !== undefined) {
      const name = data.name.trim()
      if (name.length < 2 || name.length > 100) {
        return { success: false, error: 'VALIDATION_ERROR', message: 'Name must be 2-100 characters' }
      }
      sets.push('name = ?')
      binds.push(name)
    }

    if (data.code !== undefined) {
      const code = data.code?.trim() || null
      if (code && (code.length < 1 || code.length > 20)) {
        return { success: false, error: 'VALIDATION_ERROR', message: 'Code must be 1-20 characters' }
      }
      sets.push('code = ?')
      binds.push(code)
    }

    if (data.address !== undefined) {
      sets.push('address = ?')
      binds.push(data.address?.trim() || null)
    }

    if (data.status !== undefined) {
      if (data.status !== 'active' && data.status !== 'inactive') {
        return { success: false, error: 'VALIDATION_ERROR', message: 'Invalid status' }
      }
      sets.push('status = ?')
      binds.push(data.status)
    }

    if (data.sortOrder !== undefined) {
      sets.push('sort_order = ?')
      binds.push(data.sortOrder)
    }

    if (sets.length === 0) {
      const row = await env.DB.prepare(
        `SELECT id, org_id, name, code, address, status, sort_order, created_at, updated_at
         FROM station WHERE id = ?`,
      )
        .bind(data.stationId)
        .first<StationRow>()
      return { success: true, station: toView(row!) }
    }

    const now = new Date().toISOString()
    sets.push('updated_at = ?')
    binds.push(now)
    binds.push(data.stationId)
    binds.push(membership.orgId)

    try {
      await env.DB.prepare(
        `UPDATE station SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`,
      )
        .bind(...binds)
        .run()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('idx_station_org_name')) {
        return { success: false, error: 'DUPLICATE_NAME', message: 'A station with this name already exists' }
      }
      if (msg.includes('idx_station_org_code')) {
        return { success: false, error: 'DUPLICATE_CODE', message: 'A station with this code already exists' }
      }
      throw err
    }

    const row = await env.DB.prepare(
      `SELECT id, org_id, name, code, address, status, sort_order, created_at, updated_at
       FROM station WHERE id = ?`,
    )
      .bind(data.stationId)
      .first<StationRow>()

    return { success: true, station: toView(row!) }
  })

// ---------------------------------------------------------------------------
// deleteStationServerFn
// ---------------------------------------------------------------------------

export const deleteStationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteStationInput) => d)
  .handler(async (ctx): Promise<DeleteStationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-stations')) return { success: false, error: 'FORBIDDEN' }

    const existing = await env.DB.prepare(
      `SELECT id FROM station WHERE id = ? AND org_id = ?`,
    )
      .bind(data.stationId, membership.orgId)
      .first<{ id: string }>()
    if (!existing) return { success: false, error: 'NOT_FOUND' }

    // Future: check for FK references (staff, assets) and return HAS_ASSIGNMENTS

    await env.DB.prepare(`DELETE FROM station WHERE id = ? AND org_id = ?`)
      .bind(data.stationId, membership.orgId)
      .run()

    return { success: true }
  })
