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
import { getOrgStub } from '@/server/_do-helpers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StationRow = {
  id: string
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

    const stub = getOrgStub(env, membership.orgId)
    const rows = await stub.query(
      `SELECT id, name, code, address, status, sort_order, created_at, updated_at
       FROM station
       ORDER BY sort_order ASC, LOWER(name) ASC`,
    ) as StationRow[]
    return { success: true, stations: rows.map(toView) }
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

    const stub = getOrgStub(env, membership.orgId)
    try {
      await stub.execute(
        `INSERT INTO station (id, name, code, address, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`,
        id, name, code, address, now, now,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('idx_station_org_name') || msg.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'DUPLICATE_NAME', message: 'A station with this name already exists' }
      }
      if (msg.includes('idx_station_org_code')) {
        return { success: false, error: 'DUPLICATE_CODE', message: 'A station with this code already exists' }
      }
      throw err
    }

    const row = await stub.queryOne(
      `SELECT id, name, code, address, status, sort_order, created_at, updated_at
       FROM station WHERE id = ?`,
      id,
    ) as StationRow | null

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

    const stub = getOrgStub(env, membership.orgId)

    const existing = await stub.queryOne(
      `SELECT id FROM station WHERE id = ?`,
      data.stationId,
    ) as { id: string } | null
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
      const row = await stub.queryOne(
        `SELECT id, name, code, address, status, sort_order, created_at, updated_at
         FROM station WHERE id = ?`,
        data.stationId,
      ) as StationRow | null
      return { success: true, station: toView(row!) }
    }

    const now = new Date().toISOString()
    sets.push('updated_at = ?')
    binds.push(now)
    binds.push(data.stationId)

    try {
      await stub.execute(
        `UPDATE station SET ${sets.join(', ')} WHERE id = ?`,
        ...binds,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('idx_station_org_name') || msg.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'DUPLICATE_NAME', message: 'A station with this name already exists' }
      }
      if (msg.includes('idx_station_org_code')) {
        return { success: false, error: 'DUPLICATE_CODE', message: 'A station with this code already exists' }
      }
      throw err
    }

    const row = await stub.queryOne(
      `SELECT id, name, code, address, status, sort_order, created_at, updated_at
       FROM station WHERE id = ?`,
      data.stationId,
    ) as StationRow | null

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

    const stub = getOrgStub(env, membership.orgId)

    const existing = await stub.queryOne(
      `SELECT id FROM station WHERE id = ?`,
      data.stationId,
    ) as { id: string } | null
    if (!existing) return { success: false, error: 'NOT_FOUND' }

    // Future: check for FK references (staff, assets) and return HAS_ASSIGNMENTS

    await stub.execute(`DELETE FROM station WHERE id = ?`, data.stationId)

    return { success: true }
  })
