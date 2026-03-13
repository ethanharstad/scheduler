import { createServerFn } from '@tanstack/react-start'
import { canDo } from '@/lib/rbac'
import { requireOrgMembership } from '@/server/_helpers'
import { getOrgStub } from '@/server/_do-helpers'
import type {
  RankView,
  CertLevelView,
  CertTypeView,
  StaffCertView,
  PositionView,
  EligibleStaffMember,
  EligibilityWarning,
  StaffMemberDetailView,
  ExpiringCertView,
  ListRanksInput,
  ListRanksOutput,
  CreateRankInput,
  CreateRankOutput,
  UpdateRankInput,
  UpdateRankOutput,
  DeleteRankInput,
  DeleteRankOutput,
  ListCertTypesInput,
  ListCertTypesOutput,
  CreateCertTypeInput,
  CreateCertTypeOutput,
  UpdateCertTypeInput,
  UpdateCertTypeOutput,
  UpsertCertLevelsInput,
  UpsertCertLevelsOutput,
  DeleteCertTypeInput,
  DeleteCertTypeOutput,
  ListStaffCertsInput,
  ListStaffCertsOutput,
  UpsertStaffCertInput,
  UpsertStaffCertOutput,
  RevokeStaffCertInput,
  RevokeStaffCertOutput,
  ListPositionsInput,
  ListPositionsOutput,
  CreatePositionInput,
  CreatePositionOutput,
  UpdatePositionInput,
  UpdatePositionOutput,
  DeletePositionInput,
  DeletePositionOutput,
  SetStaffRankInput,
  SetStaffRankOutput,
  CheckPositionEligibilityInput,
  CheckPositionEligibilityOutput,
  GetExpiringCertsOutput,
  GetStaffMemberDetailsOutput,
  OrgCertView,
  ListOrgCertsInput,
  ListOrgCertsOutput,
} from '@/lib/qualifications.types'

// ---------------------------------------------------------------------------
// A. Rank catalog
// ---------------------------------------------------------------------------

export const listRanksServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListRanksInput) => d)
  .handler(async (ctx): Promise<ListRanksOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    type RankRow = { id: string; name: string; sort_order: number }
    const rows = await stub.query(
      `SELECT id, name, sort_order FROM rank ORDER BY sort_order ASC`,
    ) as RankRow[]
    const ranks: RankView[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
    }))
    return { success: true, ranks }
  })

export const createRankServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateRankInput) => d)
  .handler(async (ctx): Promise<CreateRankOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const name = data.name?.trim()
    if (!name || !data.sortOrder || data.sortOrder < 1) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const stub = getOrgStub(env, membership.orgId)
    try {
      await stub.execute(
        `INSERT INTO rank (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        id, name, data.sortOrder, now, now,
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE')) return { success: false, error: 'DUPLICATE' }
      throw e
    }

    return { success: true, rank: { id, name, sortOrder: data.sortOrder } }
  })

export const updateRankServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateRankInput) => d)
  .handler(async (ctx): Promise<UpdateRankOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type RankRow = { id: string; name: string; sort_order: number }
    const existing = await stub.queryOne(
      `SELECT id, name, sort_order FROM rank WHERE id = ?`,
      data.rankId,
    ) as RankRow | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const name = data.name !== undefined ? data.name.trim() : existing.name
    const sortOrder = data.sortOrder ?? existing.sort_order

    const updateNow = new Date().toISOString()
    try {
      await stub.execute(
        `UPDATE rank SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        name, sortOrder, updateNow, data.rankId,
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE')) return { success: false, error: 'DUPLICATE' }
      throw e
    }

    return { success: true }
  })

export const deleteRankServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteRankInput) => d)
  .handler(async (ctx): Promise<DeleteRankOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type RankRow = { id: string }
    const existing = await stub.queryOne(
      `SELECT id FROM rank WHERE id = ?`,
      data.rankId,
    ) as RankRow | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    // Check if any staff or position uses this rank
    type CountRow = { n: number }
    const usedByStaff = await stub.queryOne(
      `SELECT COUNT(*) AS n FROM staff_member WHERE rank_id = ?`,
      data.rankId,
    ) as CountRow | null
    const usedByPosition = await stub.queryOne(
      `SELECT COUNT(*) AS n FROM position WHERE min_rank_id = ?`,
      data.rankId,
    ) as CountRow | null

    if ((usedByStaff?.n ?? 0) > 0 || (usedByPosition?.n ?? 0) > 0) {
      return { success: false, error: 'IN_USE' }
    }

    await stub.execute(`DELETE FROM rank WHERE id = ?`, data.rankId)

    return { success: true }
  })

// ---------------------------------------------------------------------------
// B. Cert type / level catalog
// ---------------------------------------------------------------------------

export const listCertTypesServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListCertTypesInput) => d)
  .handler(async (ctx): Promise<ListCertTypesOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    type TypeRow = { id: string; name: string; description: string | null; is_leveled: number }
    const types = await stub.query(
      `SELECT id, name, description, is_leveled FROM cert_type ORDER BY name ASC`,
    ) as TypeRow[]
    if (types.length === 0) return { success: true, certTypes: [] }

    type LevelRow = { id: string; cert_type_id: string; name: string; level_order: number }
    const levels = await stub.query(
      `SELECT id, cert_type_id, name, level_order
       FROM cert_level
       WHERE cert_type_id IN (${types.map(() => '?').join(',')})
       ORDER BY cert_type_id, level_order ASC`,
      ...types.map((t) => t.id),
    ) as LevelRow[]

    const levelsByType = new Map<string, CertLevelView[]>()
    for (const l of levels) {
      if (!levelsByType.has(l.cert_type_id)) levelsByType.set(l.cert_type_id, [])
      levelsByType.get(l.cert_type_id)!.push({
        id: l.id,
        certTypeId: l.cert_type_id,
        name: l.name,
        levelOrder: l.level_order,
      })
    }

    const certTypes: CertTypeView[] = types.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      isLeveled: t.is_leveled === 1,
      levels: levelsByType.get(t.id) ?? [],
    }))

    return { success: true, certTypes }
  })

export const createCertTypeServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateCertTypeInput) => d)
  .handler(async (ctx): Promise<CreateCertTypeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const name = data.name?.trim()
    if (!name) return { success: false, error: 'VALIDATION_ERROR' }
    if (data.isLeveled && (!data.levels || data.levels.length === 0)) {
      return { success: false, error: 'VALIDATION_ERROR' }
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const stub = getOrgStub(env, membership.orgId)
    const levels: CertLevelView[] = []

    const doStmts: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `INSERT INTO cert_type (id, name, description, is_leveled, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [id, name, data.description?.trim() || null, data.isLeveled ? 1 : 0, now, now],
      },
    ]

    if (data.isLeveled && data.levels) {
      for (const l of data.levels) {
        const levelId = crypto.randomUUID()
        doStmts.push({
          sql: `INSERT INTO cert_level (id, cert_type_id, name, level_order, created_at) VALUES (?, ?, ?, ?, ?)`,
          params: [levelId, id, l.name.trim(), l.levelOrder, now],
        })
        levels.push({ id: levelId, certTypeId: id, name: l.name.trim(), levelOrder: l.levelOrder })
      }
    }

    try {
      await stub.executeBatch(doStmts)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE')) return { success: false, error: 'DUPLICATE' }
      throw e
    }

    const certType: CertTypeView = {
      id,
      name,
      description: data.description?.trim() || null,
      isLeveled: data.isLeveled,
      levels,
    }
    return { success: true, certType }
  })

export const updateCertTypeServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateCertTypeInput) => d)
  .handler(async (ctx): Promise<UpdateCertTypeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type CertTypeRow = { id: string; name: string; description: string | null }
    const existing = await stub.queryOne(
      `SELECT id, name, description FROM cert_type WHERE id = ?`,
      data.certTypeId,
    ) as CertTypeRow | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const name = data.name !== undefined ? data.name.trim() : existing.name
    const description = data.description !== undefined ? data.description : existing.description

    const updateNow = new Date().toISOString()
    try {
      await stub.execute(
        `UPDATE cert_type SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
        name, description, updateNow, data.certTypeId,
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE')) return { success: false, error: 'DUPLICATE' }
      throw e
    }

    return { success: true }
  })

export const upsertCertLevelsServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpsertCertLevelsInput) => d)
  .handler(async (ctx): Promise<UpsertCertLevelsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type TypeRow = { id: string; is_leveled: number }
    const certType = await stub.queryOne(
      `SELECT id, is_leveled FROM cert_type WHERE id = ?`,
      data.certTypeId,
    ) as TypeRow | null

    if (!certType) return { success: false, error: 'NOT_FOUND' }

    // Get existing levels
    type LevelRow = { id: string; level_order: number }
    const existing = await stub.query(
      `SELECT id, level_order FROM cert_level WHERE cert_type_id = ? ORDER BY level_order ASC`,
      data.certTypeId,
    ) as LevelRow[]

    const newOrders = new Set(data.levels.map((l) => l.levelOrder))
    const existingByOrder = new Map(existing.map((e) => [e.level_order, e.id]))

    // Find level IDs that would be deleted (in DO but not in new list)
    const toDeleteIds: string[] = []
    for (const e of existing) {
      if (!newOrders.has(e.level_order)) {
        toDeleteIds.push(e.id)
      }
    }

    // Check if any to-delete levels are referenced
    if (toDeleteIds.length > 0) {
      const placeholders = toDeleteIds.map(() => '?').join(',')
      type CountRow = { n: number }
      const usedInCerts = await stub.queryOne(
        `SELECT COUNT(*) AS n FROM staff_certification WHERE cert_level_id IN (${placeholders})`,
        ...toDeleteIds,
      ) as CountRow | null
      const usedInReqs = await stub.queryOne(
        `SELECT COUNT(*) AS n FROM position_cert_requirement WHERE min_cert_level_id IN (${placeholders})`,
        ...toDeleteIds,
      ) as CountRow | null

      if ((usedInCerts?.n ?? 0) > 0 || (usedInReqs?.n ?? 0) > 0) {
        return { success: false, error: 'LEVELS_IN_USE' }
      }
    }

    const now = new Date().toISOString()
    const doStmts: Array<{ sql: string; params: unknown[] }> = []

    // Delete removed levels
    for (const id of toDeleteIds) {
      doStmts.push({ sql: `DELETE FROM cert_level WHERE id = ?`, params: [id] })
    }

    const resultLevels: CertLevelView[] = []

    // Update or insert levels
    for (const l of data.levels) {
      const existingId = existingByOrder.get(l.levelOrder)
      if (existingId) {
        doStmts.push({
          sql: `UPDATE cert_level SET name = ? WHERE id = ?`,
          params: [l.name.trim(), existingId],
        })
        resultLevels.push({
          id: existingId,
          certTypeId: data.certTypeId,
          name: l.name.trim(),
          levelOrder: l.levelOrder,
        })
      } else {
        const newId = crypto.randomUUID()
        doStmts.push({
          sql: `INSERT INTO cert_level (id, cert_type_id, name, level_order, created_at) VALUES (?, ?, ?, ?, ?)`,
          params: [newId, data.certTypeId, l.name.trim(), l.levelOrder, now],
        })
        resultLevels.push({
          id: newId,
          certTypeId: data.certTypeId,
          name: l.name.trim(),
          levelOrder: l.levelOrder,
        })
      }
    }

    if (doStmts.length > 0) {
      await stub.executeBatch(doStmts)
    }

    resultLevels.sort((a, b) => a.levelOrder - b.levelOrder)
    return { success: true, levels: resultLevels }
  })

export const deleteCertTypeServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteCertTypeInput) => d)
  .handler(async (ctx): Promise<DeleteCertTypeOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type CertTypeRow = { id: string }
    const existing = await stub.queryOne(
      `SELECT id FROM cert_type WHERE id = ?`,
      data.certTypeId,
    ) as CertTypeRow | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    type CountRow = { n: number }
    const used = await stub.queryOne(
      `SELECT COUNT(*) AS n FROM staff_certification WHERE cert_type_id = ?`,
      data.certTypeId,
    ) as CountRow | null

    if ((used?.n ?? 0) > 0) return { success: false, error: 'IN_USE' }

    await stub.execute(`DELETE FROM cert_type WHERE id = ?`, data.certTypeId)

    return { success: true }
  })

// ---------------------------------------------------------------------------
// C. Staff cert records
// ---------------------------------------------------------------------------

export const listStaffCertsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListStaffCertsInput) => d)
  .handler(async (ctx): Promise<ListStaffCertsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)

    // Allow if manage/view-certifications, or if caller's own staff record
    const canView = canDo(membership.role, 'view-certifications')
    if (!canView) {
      // Check if the staffMemberId belongs to this user
      type StaffRow = { id: string }
      const ownRecord = await stub.queryOne(
        `SELECT id FROM staff_member WHERE id = ? AND user_id = ?`,
        data.staffMemberId, membership.userId,
      ) as StaffRow | null
      if (!ownRecord) return { success: false, error: 'UNAUTHORIZED' }
    }

    // Verify staff member exists in this org
    type StaffExistsRow = { id: string }
    const staffMember = await stub.queryOne(
      `SELECT id FROM staff_member WHERE id = ?`,
      data.staffMemberId,
    ) as StaffExistsRow | null
    if (!staffMember) return { success: false, error: 'NOT_FOUND' }

    // Lazy-mark expired certs
    const today = new Date().toISOString().slice(0, 10)
    const lazyMarkNow = new Date().toISOString()
    await stub.execute(
      `UPDATE staff_certification SET status = 'expired', updated_at = ?
       WHERE staff_member_id = ? AND status = 'active'
         AND expires_at IS NOT NULL AND expires_at <= ?`,
      lazyMarkNow, data.staffMemberId, today,
    )

    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    type CertRow = {
      id: string
      cert_type_id: string
      cert_type_name: string
      cert_level_id: string | null
      cert_level_name: string | null
      issued_at: string | null
      expires_at: string | null
      cert_number: string | null
      notes: string | null
      status: string
    }
    const certRows = await stub.query(
      `SELECT sc.id, sc.cert_type_id, ct.name AS cert_type_name,
              sc.cert_level_id, cl.name AS cert_level_name,
              sc.issued_at, sc.expires_at, sc.cert_number, sc.notes, sc.status
       FROM staff_certification sc
       JOIN cert_type ct ON ct.id = sc.cert_type_id
       LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sc.staff_member_id = ?
       ORDER BY ct.name ASC`,
      data.staffMemberId,
    ) as CertRow[]
    const certs: StaffCertView[] = certRows.map((r) => ({
      id: r.id,
      staffMemberId: data.staffMemberId,
      certTypeId: r.cert_type_id,
      certTypeName: r.cert_type_name,
      certLevelId: r.cert_level_id,
      certLevelName: r.cert_level_name,
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
      certNumber: r.cert_number,
      notes: r.notes,
      status: r.status as StaffCertView['status'],
      isExpiringSoon:
        r.status === 'active' &&
        r.expires_at !== null &&
        r.expires_at > today &&
        r.expires_at <= soonStr,
    }))
    return { success: true, certs }
  })

export const upsertStaffCertServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpsertStaffCertInput) => d)
  .handler(async (ctx): Promise<UpsertStaffCertOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    // Verify staff member exists in this org
    type StaffRow = { id: string }
    const staffMember = await stub.queryOne(
      `SELECT id FROM staff_member WHERE id = ? AND status != 'removed'`,
      data.staffMemberId,
    ) as StaffRow | null
    if (!staffMember) return { success: false, error: 'NOT_FOUND' }

    // Verify cert type exists in this org
    type TypeRow = { id: string; name: string; is_leveled: number }
    const certType = await stub.queryOne(
      `SELECT id, name, is_leveled FROM cert_type WHERE id = ?`,
      data.certTypeId,
    ) as TypeRow | null
    if (!certType) return { success: false, error: 'NOT_FOUND' }

    // Validate certLevelId belongs to certType
    let certLevelName: string | null = null
    if (data.certLevelId) {
      if (certType.is_leveled !== 1) {
        return { success: false, error: 'VALIDATION_ERROR' }
      }
      type LevelRow = { id: string; name: string }
      const level = await stub.queryOne(
        `SELECT id, name FROM cert_level WHERE id = ? AND cert_type_id = ?`,
        data.certLevelId, data.certTypeId,
      ) as LevelRow | null
      if (!level) return { success: false, error: 'VALIDATION_ERROR' }
      certLevelName = level.name
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await stub.execute(
      `INSERT INTO staff_certification
         (id, staff_member_id, cert_type_id, cert_level_id,
          issued_at, expires_at, cert_number, notes, status, added_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
       ON CONFLICT(staff_member_id, cert_type_id) DO UPDATE SET
         cert_level_id = excluded.cert_level_id,
         issued_at     = excluded.issued_at,
         expires_at    = excluded.expires_at,
         cert_number   = excluded.cert_number,
         notes         = excluded.notes,
         status        = 'active',
         added_by      = excluded.added_by,
         updated_at    = excluded.updated_at`,
      id,
      data.staffMemberId,
      data.certTypeId,
      data.certLevelId ?? null,
      data.issuedAt ?? null,
      data.expiresAt ?? null,
      data.certNumber?.trim() || null,
      data.notes?.trim() || null,
      membership.userId,
      now,
      now,
    )

    // Fetch the upserted row to get the actual ID
    type CertRow = {
      id: string
      cert_level_id: string | null
      issued_at: string | null
      expires_at: string | null
      cert_number: string | null
      notes: string | null
      status: string
    }
    const certRow = await stub.queryOne(
      `SELECT id, cert_level_id, issued_at, expires_at, cert_number, notes, status
       FROM staff_certification
       WHERE staff_member_id = ? AND cert_type_id = ?`,
      data.staffMemberId, data.certTypeId,
    ) as CertRow | null

    const today = new Date().toISOString().slice(0, 10)
    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    const cert: StaffCertView = {
      id: certRow?.id ?? id,
      staffMemberId: data.staffMemberId,
      certTypeId: data.certTypeId,
      certTypeName: certType.name,
      certLevelId: certRow?.cert_level_id ?? null,
      certLevelName,
      issuedAt: certRow?.issued_at ?? null,
      expiresAt: certRow?.expires_at ?? null,
      certNumber: certRow?.cert_number ?? null,
      notes: certRow?.notes ?? null,
      status: (certRow?.status ?? 'active') as StaffCertView['status'],
      isExpiringSoon:
        (certRow?.status ?? 'active') === 'active' &&
        certRow?.expires_at !== null &&
        certRow?.expires_at !== undefined &&
        certRow.expires_at > today &&
        certRow.expires_at <= soonStr,
    }

    return { success: true, cert }
  })

export const revokeStaffCertServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: RevokeStaffCertInput) => d)
  .handler(async (ctx): Promise<RevokeStaffCertOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type CertRow = { id: string }
    const existing = await stub.queryOne(
      `SELECT sc.id FROM staff_certification sc
       JOIN staff_member sm ON sm.id = sc.staff_member_id
       WHERE sc.staff_member_id = ? AND sc.cert_type_id = ?`,
      data.staffMemberId, data.certTypeId,
    ) as CertRow | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const revokeNow = new Date().toISOString()
    await stub.execute(
      `UPDATE staff_certification SET status = 'revoked', updated_at = ? WHERE id = ?`,
      revokeNow, existing.id,
    )

    return { success: true }
  })

// ---------------------------------------------------------------------------
// D. Position catalog
// ---------------------------------------------------------------------------

async function fetchPositionWithRequirements(
  env: Cloudflare.Env,
  positionId: string,
  orgId: string,
): Promise<PositionView | null> {
  const stub = getOrgStub(env, orgId)

  type PosRow = {
    id: string
    name: string
    description: string | null
    min_rank_id: string | null
    min_rank_name: string | null
    sort_order: number
  }
  const pos = await stub.queryOne(
    `SELECT p.id, p.name, p.description, p.min_rank_id, p.sort_order, r.name AS min_rank_name
     FROM position p
     LEFT JOIN rank r ON r.id = p.min_rank_id
     WHERE p.id = ?`,
    positionId,
  ) as PosRow | null

  if (!pos) return null

  type ReqRow = {
    id: string
    cert_type_id: string
    cert_type_name: string
    min_cert_level_id: string | null
    min_cert_level_name: string | null
  }
  const reqRows = await stub.query(
    `SELECT pcr.id, pcr.cert_type_id, ct.name AS cert_type_name,
            pcr.min_cert_level_id, cl.name AS min_cert_level_name
     FROM position_cert_requirement pcr
     JOIN cert_type ct ON ct.id = pcr.cert_type_id
     LEFT JOIN cert_level cl ON cl.id = pcr.min_cert_level_id
     WHERE pcr.position_id = ?`,
    positionId,
  ) as ReqRow[]

  return {
    id: pos.id,
    name: pos.name,
    description: pos.description,
    minRankId: pos.min_rank_id,
    minRankName: pos.min_rank_name,
    sortOrder: pos.sort_order,
    requirements: reqRows.map((r) => ({
      id: r.id,
      certTypeId: r.cert_type_id,
      certTypeName: r.cert_type_name,
      minCertLevelId: r.min_cert_level_id,
      minCertLevelName: r.min_cert_level_name,
    })),
  }
}

export const listPositionsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListPositionsInput) => d)
  .handler(async (ctx): Promise<ListPositionsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)
    type PosRow = {
      id: string
      name: string
      description: string | null
      min_rank_id: string | null
      min_rank_name: string | null
      sort_order: number
    }
    const posList = await stub.query(
      `SELECT p.id, p.name, p.description, p.min_rank_id, p.sort_order, r.name AS min_rank_name
       FROM position p
       LEFT JOIN rank r ON r.id = p.min_rank_id
       ORDER BY p.sort_order DESC, p.name ASC`,
    ) as PosRow[]
    if (posList.length === 0) return { success: true, positions: [] }

    type ReqRow = {
      id: string
      position_id: string
      cert_type_id: string
      cert_type_name: string
      min_cert_level_id: string | null
      min_cert_level_name: string | null
    }
    const reqRows = await stub.query(
      `SELECT pcr.id, pcr.position_id, pcr.cert_type_id, ct.name AS cert_type_name,
              pcr.min_cert_level_id, cl.name AS min_cert_level_name
       FROM position_cert_requirement pcr
       JOIN cert_type ct ON ct.id = pcr.cert_type_id
       LEFT JOIN cert_level cl ON cl.id = pcr.min_cert_level_id
       WHERE pcr.position_id IN (${posList.map(() => '?').join(',')})`,
      ...posList.map((p) => p.id),
    ) as ReqRow[]

    const reqsByPos = new Map<string, PositionView['requirements']>()
    for (const r of reqRows) {
      if (!reqsByPos.has(r.position_id)) reqsByPos.set(r.position_id, [])
      reqsByPos.get(r.position_id)!.push({
        id: r.id,
        certTypeId: r.cert_type_id,
        certTypeName: r.cert_type_name,
        minCertLevelId: r.min_cert_level_id,
        minCertLevelName: r.min_cert_level_name,
      })
    }

    const positions: PositionView[] = posList.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      minRankId: p.min_rank_id,
      minRankName: p.min_rank_name,
      sortOrder: p.sort_order,
      requirements: reqsByPos.get(p.id) ?? [],
    }))

    return { success: true, positions }
  })

export const createPositionServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreatePositionInput) => d)
  .handler(async (ctx): Promise<CreatePositionOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const name = data.name?.trim()
    if (!name) return { success: false, error: 'VALIDATION_ERROR' }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const sortOrder = data.sortOrder ?? 0

    const stub = getOrgStub(env, membership.orgId)
    const doStmts: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `INSERT INTO position (id, name, description, min_rank_id, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [id, name, data.description?.trim() || null, data.minRankId ?? null, sortOrder, now, now],
      },
    ]

    for (const req of data.requirements ?? []) {
      const reqId = crypto.randomUUID()
      doStmts.push({
        sql: `INSERT INTO position_cert_requirement (id, position_id, cert_type_id, min_cert_level_id, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [reqId, id, req.certTypeId, req.minCertLevelId ?? null, now],
      })
    }

    try {
      await stub.executeBatch(doStmts)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE')) return { success: false, error: 'DUPLICATE' }
      throw e
    }

    const position = await fetchPositionWithRequirements(env, id, membership.orgId)
    if (!position) return { success: false, error: 'VALIDATION_ERROR' }

    return { success: true, position }
  })

export const updatePositionServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdatePositionInput) => d)
  .handler(async (ctx): Promise<UpdatePositionOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type PosRow = { id: string; name: string; description: string | null; min_rank_id: string | null; sort_order: number }
    const existing = await stub.queryOne(
      `SELECT id, name, description, min_rank_id, sort_order FROM position WHERE id = ?`,
      data.positionId,
    ) as PosRow | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const name = data.name !== undefined ? data.name.trim() : existing.name
    const description = data.description !== undefined ? data.description : existing.description
    const minRankId = data.minRankId !== undefined ? data.minRankId : existing.min_rank_id
    const sortOrder = data.sortOrder !== undefined ? data.sortOrder : existing.sort_order
    const now = new Date().toISOString()

    const doStmts: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `UPDATE position SET name = ?, description = ?, min_rank_id = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        params: [name, description, minRankId, sortOrder, now, data.positionId],
      },
    ]

    if (data.requirements !== undefined) {
      doStmts.push({
        sql: `DELETE FROM position_cert_requirement WHERE position_id = ?`,
        params: [data.positionId],
      })
      for (const req of data.requirements) {
        const reqId = crypto.randomUUID()
        doStmts.push({
          sql: `INSERT INTO position_cert_requirement (id, position_id, cert_type_id, min_cert_level_id, created_at)
                VALUES (?, ?, ?, ?, ?)`,
          params: [reqId, data.positionId, req.certTypeId, req.minCertLevelId ?? null, now],
        })
      }
    }

    try {
      await stub.executeBatch(doStmts)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE')) return { success: false, error: 'DUPLICATE' }
      throw e
    }

    return { success: true }
  })

export const deletePositionServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DeletePositionInput) => d)
  .handler(async (ctx): Promise<DeletePositionOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type PosRow = { id: string }
    const existing = await stub.queryOne(
      `SELECT id FROM position WHERE id = ?`,
      data.positionId,
    ) as PosRow | null

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    type CountRow = { n: number }
    const inUse = await stub.queryOne(
      `SELECT COUNT(*) AS n FROM shift_assignment WHERE position_id = ?`,
      data.positionId,
    ) as CountRow | null

    if ((inUse?.n ?? 0) > 0) return { success: false, error: 'IN_USE' }

    await stub.execute(`DELETE FROM position WHERE id = ?`, data.positionId)

    return { success: true }
  })

// ---------------------------------------------------------------------------
// E. Staff rank
// ---------------------------------------------------------------------------

export const setStaffRankServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: SetStaffRankInput) => d)
  .handler(async (ctx): Promise<SetStaffRankOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-certifications')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type StaffRow = { id: string; name: string; rank_id: string | null }
    const staff = await stub.queryOne(
      `SELECT id, name, rank_id FROM staff_member WHERE id = ? AND status != 'removed'`,
      data.staffMemberId,
    ) as StaffRow | null

    if (!staff) return { success: false, error: 'NOT_FOUND' }

    // If setting a rank, verify it exists
    if (data.rankId !== null) {
      type RankRow = { id: string; name: string }
      const rank = await stub.queryOne(
        `SELECT id, name FROM rank WHERE id = ?`,
        data.rankId,
      ) as RankRow | null
      if (!rank) return { success: false, error: 'NOT_FOUND' }
    }

    const now = new Date().toISOString()
    const auditId = crypto.randomUUID()
    const auditMetadata = JSON.stringify({ previousRankId: staff.rank_id, newRankId: data.rankId })

    await stub.executeBatch([
      {
        sql: `UPDATE staff_member SET rank_id = ?, updated_at = ? WHERE id = ?`,
        params: [data.rankId, now, data.staffMemberId],
      },
      {
        sql: `INSERT INTO staff_audit_log (id, staff_member_id, performed_by, action, metadata, created_at)
              VALUES (?, ?, ?, 'rank_changed', ?, ?)`,
        params: [auditId, data.staffMemberId, membership.userId, auditMetadata, now],
      },
    ])

    return { success: true }
  })

// ---------------------------------------------------------------------------
// F. Eligibility
// ---------------------------------------------------------------------------

/** Shared helper: check a single staff member's eligibility for a position. */
export async function checkSingleStaffEligibility(
  env: Cloudflare.Env,
  orgId: string,
  staffMemberId: string,
  positionId: string,
  asOfDate: string,
): Promise<EligibilityWarning[]> {
  const warnings: EligibilityWarning[] = []
  const stub = getOrgStub(env, orgId)

  type PosRow = {
    min_rank_id: string | null
    min_rank_sort_order: number | null
    min_rank_name: string | null
  }
  const pos = await stub.queryOne(
    `SELECT p.min_rank_id, r.sort_order AS min_rank_sort_order, r.name AS min_rank_name
     FROM position p
     LEFT JOIN rank r ON r.id = p.min_rank_id
     WHERE p.id = ?`,
    positionId,
  ) as PosRow | null

  if (!pos) return warnings

  type StaffRow = {
    rank_id: string | null
    rank_sort_order: number | null
    rank_name: string | null
  }
  const staff = await stub.queryOne(
    `SELECT sm.rank_id, r.sort_order AS rank_sort_order, r.name AS rank_name
     FROM staff_member sm
     LEFT JOIN rank r ON r.id = sm.rank_id
     WHERE sm.id = ?`,
    staffMemberId,
  ) as StaffRow | null

  if (!staff) return warnings

  // Rank check
  if (pos.min_rank_id !== null) {
    if (
      staff.rank_id === null ||
      (staff.rank_sort_order ?? 0) < (pos.min_rank_sort_order ?? 1)
    ) {
      warnings.push({
        type: 'RANK_NOT_MET',
        required: pos.min_rank_name ?? undefined,
        actual: staff.rank_name,
      })
    }
  }

  // Cert requirements
  type ReqRow = {
    cert_type_id: string
    cert_type_name: string
    min_cert_level_id: string | null
    min_level_order: number | null
    min_cert_level_name: string | null
  }
  const reqRows = await stub.query(
    `SELECT pcr.cert_type_id, ct.name AS cert_type_name,
            pcr.min_cert_level_id, cl.level_order AS min_level_order,
            cl.name AS min_cert_level_name
     FROM position_cert_requirement pcr
     JOIN cert_type ct ON ct.id = pcr.cert_type_id
     LEFT JOIN cert_level cl ON cl.id = pcr.min_cert_level_id
     WHERE pcr.position_id = ?`,
    positionId,
  ) as ReqRow[]

  for (const req of reqRows) {
    type CertRow = {
      status: string
      expires_at: string | null
      level_order: number | null
    }
    const cert = await stub.queryOne(
      `SELECT sc.status, sc.expires_at, cl.level_order
       FROM staff_certification sc
       LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sc.staff_member_id = ? AND sc.cert_type_id = ?`,
      staffMemberId, req.cert_type_id,
    ) as CertRow | null

    if (!cert || cert.status === 'revoked') {
      warnings.push({ type: 'CERT_MISSING', certTypeName: req.cert_type_name })
      continue
    }

    // Check expiry
    if (cert.expires_at !== null && cert.expires_at <= asOfDate) {
      warnings.push({
        type: 'CERT_EXPIRED',
        certTypeName: req.cert_type_name,
        expiresAt: cert.expires_at,
      })
      continue
    }

    // Check expiring soon (within 30 days from asOfDate)
    if (cert.expires_at !== null && cert.status === 'active') {
      const soonDate = new Date(asOfDate + 'T00:00:00')
      soonDate.setDate(soonDate.getDate() + 30)
      if (cert.expires_at <= soonDate.toISOString().slice(0, 10)) {
        warnings.push({
          type: 'CERT_EXPIRING_SOON',
          certTypeName: req.cert_type_name,
          expiresAt: cert.expires_at,
        })
        // Don't continue — expiring soon is advisory, cert still valid
      }
    }

    // Check level
    if (req.min_cert_level_id !== null && req.min_level_order !== null) {
      if (cert.level_order === null || cert.level_order < req.min_level_order) {
        warnings.push({
          type: 'CERT_LEVEL_NOT_MET',
          certTypeName: req.cert_type_name,
          required: req.min_cert_level_name ?? undefined,
          actual: cert.level_order !== null ? String(cert.level_order) : null,
        })
      }
    }
  }

  return warnings
}

export const checkPositionEligibilityServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: CheckPositionEligibilityInput) => d)
  .handler(async (ctx): Promise<CheckPositionEligibilityOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'view-certifications')) {
      return { success: false, error: 'UNAUTHORIZED' }
    }

    const stub = getOrgStub(env, membership.orgId)

    type PosRow = { id: string; name: string; min_rank_id: string | null; min_rank_sort_order: number | null; min_rank_name: string | null }
    const pos = await stub.queryOne(
      `SELECT p.id, p.name, p.min_rank_id, r.sort_order AS min_rank_sort_order, r.name AS min_rank_name
       FROM position p LEFT JOIN rank r ON r.id = p.min_rank_id WHERE p.id = ?`,
      data.positionId,
    ) as PosRow | null
    if (!pos) return { success: false, error: 'NOT_FOUND' }

    type ReqRow = { cert_type_id: string; min_cert_level_id: string | null; min_level_order: number | null }
    const reqs = await stub.query(
      `SELECT pcr.cert_type_id, pcr.min_cert_level_id, cl.level_order AS min_level_order
       FROM position_cert_requirement pcr LEFT JOIN cert_level cl ON cl.id = pcr.min_cert_level_id
       WHERE pcr.position_id = ?`,
      data.positionId,
    ) as ReqRow[]

    type StaffRow = { id: string; name: string; rank_id: string | null; rank_sort_order: number | null; rank_name: string | null }
    const allStaff = await stub.query(
      `SELECT sm.id, sm.name, sm.rank_id, r.sort_order AS rank_sort_order, r.name AS rank_name
       FROM staff_member sm LEFT JOIN rank r ON r.id = sm.rank_id
       WHERE sm.status != 'removed' ORDER BY sm.name ASC`,
    ) as StaffRow[]
    if (allStaff.length === 0) return { success: true, eligible: [], positionName: pos.name }

    type CertRow = { staff_member_id: string; cert_type_id: string; expires_at: string | null; level_order: number | null }
    const certs = await stub.query(
      `SELECT sc.staff_member_id, sc.cert_type_id, sc.expires_at, cl.level_order
       FROM staff_certification sc LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sc.status = 'active' AND (sc.expires_at IS NULL OR sc.expires_at > ?)`,
      data.asOfDate,
    ) as CertRow[]

    const soonDate = new Date(data.asOfDate + 'T00:00:00')
    soonDate.setDate(soonDate.getDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    type CertInfo = { levelOrder: number | null; expiresAt: string | null }
    const certsByStaff = new Map<string, Map<string, CertInfo>>()
    for (const c of certs) {
      if (!certsByStaff.has(c.staff_member_id)) certsByStaff.set(c.staff_member_id, new Map())
      certsByStaff.get(c.staff_member_id)!.set(c.cert_type_id, { levelOrder: c.level_order, expiresAt: c.expires_at })
    }

    const eligible: EligibleStaffMember[] = []
    for (const staff of allStaff) {
      if (pos.min_rank_id !== null) {
        if (staff.rank_id === null || (staff.rank_sort_order ?? 0) < (pos.min_rank_sort_order ?? 1)) continue
      }
      const staffCerts = certsByStaff.get(staff.id) ?? new Map<string, CertInfo>()
      let meetsAllCerts = true
      for (const req of reqs) {
        const cert = staffCerts.get(req.cert_type_id)
        if (!cert) { meetsAllCerts = false; break }
        if (req.min_cert_level_id !== null && req.min_level_order !== null) {
          if (cert.levelOrder === null || cert.levelOrder < req.min_level_order) { meetsAllCerts = false; break }
        }
      }
      if (!meetsAllCerts) continue

      let hasExpiringCerts = false
      for (const [, ci] of staffCerts) {
        if (ci.expiresAt !== null && ci.expiresAt <= soonStr) { hasExpiringCerts = true; break }
      }
      const certsSummary = `${staffCerts.size} cert${staffCerts.size !== 1 ? 's' : ''}`
      eligible.push({
        staffMemberId: staff.id, name: staff.name, rankName: staff.rank_name,
        certsSummary, hasExpiringCerts, constraintType: null, isScheduledAdjacent: false,
      })
    }

    if (eligible.length > 0) {
      const eligibleIds = eligible.map((e) => e.staffMemberId)
      const ph = eligibleIds.map(() => '?').join(',')
      const dayStart = data.asOfDate + 'T00:00:00'
      const dayEnd = data.asOfDate + 'T23:59:59'

      type ConstraintRow = { staff_member_id: string; type: string; days_of_week: string | null }
      const constraints = await stub.query(
        `SELECT staff_member_id, type, days_of_week FROM staff_constraint
         WHERE staff_member_id IN (${ph}) AND status = 'approved'
           AND start_datetime < ? AND end_datetime > ?`,
        ...eligibleIds, dayEnd, dayStart,
      ) as ConstraintRow[]
      const constraintPriority: Record<string, number> = { time_off: 3, unavailable: 3, not_preferred: 2, preferred: 1 }
      const staffConstraintMap = new Map<string, string>()
      const targetDow = new Date(data.asOfDate + 'T00:00:00').getDay()
      for (const row of constraints) {
        if (row.days_of_week !== null) {
          const days: number[] = JSON.parse(row.days_of_week)
          if (!days.includes(targetDow)) continue
        }
        const ex = staffConstraintMap.get(row.staff_member_id)
        const exP = ex ? (constraintPriority[ex] ?? 0) : 0
        if ((constraintPriority[row.type] ?? 0) > exP) staffConstraintMap.set(row.staff_member_id, row.type)
      }
      for (const m of eligible) {
        const ct = staffConstraintMap.get(m.staffMemberId)
        if (ct === 'time_off' || ct === 'unavailable' || ct === 'preferred' || ct === 'not_preferred') m.constraintType = ct
      }

      const prevDate = new Date(data.asOfDate + 'T00:00:00'); prevDate.setDate(prevDate.getDate() - 1)
      const nextDate = new Date(data.asOfDate + 'T00:00:00'); nextDate.setDate(nextDate.getDate() + 1)
      const prevStr = prevDate.toISOString().slice(0, 10)
      const nextStr = nextDate.toISOString().slice(0, 10)
      type AdjacentRow = { staff_member_id: string }
      const adjacent = await stub.query(
        `SELECT DISTINCT sa.staff_member_id FROM shift_assignment sa
         JOIN schedule s ON s.id = sa.schedule_id
         WHERE sa.staff_member_id IN (${ph})
           AND (sa.start_datetime LIKE ? OR sa.start_datetime LIKE ?)`,
        ...eligibleIds, prevStr + '%', nextStr + '%',
      ) as AdjacentRow[]
      const adjacentIds = new Set(adjacent.map((r) => r.staff_member_id))
      for (const m of eligible) { if (adjacentIds.has(m.staffMemberId)) m.isScheduledAdjacent = true }
    }

    return { success: true, eligible, positionName: pos.name }
  })

// ---------------------------------------------------------------------------
// G. Expiring certs (dashboard widget)
// ---------------------------------------------------------------------------

export const getExpiringCertsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { orgSlug: string }) => d)
  .handler(async (ctx): Promise<GetExpiringCertsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership || !canDo(membership.role, 'view-certifications')) {
      return { success: false, error: 'UNAUTHORIZED' }
    }

    const today = new Date().toISOString().slice(0, 10)
    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    const stub = getOrgStub(env, membership.orgId)
    type CertRow = { staff_member_id: string; staff_member_name: string; cert_type_name: string; expires_at: string }
    const rows = await stub.query(
      `SELECT sc.staff_member_id, sm.name AS staff_member_name,
              ct.name AS cert_type_name, sc.expires_at
       FROM staff_certification sc
       JOIN staff_member sm ON sm.id = sc.staff_member_id
       JOIN cert_type ct ON ct.id = sc.cert_type_id
       WHERE sc.status = 'active'
         AND sc.expires_at IS NOT NULL
         AND sc.expires_at > ? AND sc.expires_at <= ?
         AND sm.status != 'removed'
       ORDER BY sc.expires_at ASC`,
      today, soonStr,
    ) as CertRow[]
    const certs: ExpiringCertView[] = rows.map((r) => {
      const daysUntilExpiry = Math.ceil(
        (new Date(r.expires_at + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000,
      )
      return { staffMemberId: r.staff_member_id, staffMemberName: r.staff_member_name, certTypeName: r.cert_type_name, expiresAt: r.expires_at, daysUntilExpiry }
    })
    return { success: true, certs }
  })

// ---------------------------------------------------------------------------
// H. Staff member detail (used by staff.$staffMemberId route)
// ---------------------------------------------------------------------------

export const getStaffMemberDetailsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { orgSlug: string; staffMemberId: string }) => d)
  .handler(async (ctx): Promise<GetStaffMemberDetailsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)

    const canView = canDo(membership.role, 'view-certifications')
    if (!canView) {
      // Only allow viewing own record
      type OwnRow = { id: string }
      const own = await stub.queryOne(
        `SELECT id FROM staff_member WHERE id = ? AND user_id = ?`,
        data.staffMemberId, membership.userId,
      ) as OwnRow | null
      if (!own) return { success: false, error: 'UNAUTHORIZED' }
    }

    type StaffRow = {
      id: string
      name: string
      email: string | null
      phone: string | null
      role: string
      status: string
      rank_id: string | null
      rank_name: string | null
      rank_sort_order: number | null
    }
    const staff = await stub.queryOne(
      `SELECT sm.id, sm.name, sm.email, sm.phone, sm.role, sm.status,
              sm.rank_id, r.name AS rank_name, r.sort_order AS rank_sort_order
       FROM staff_member sm
       LEFT JOIN rank r ON r.id = sm.rank_id
       WHERE sm.id = ?`,
      data.staffMemberId,
    ) as StaffRow | null

    if (!staff) return { success: false, error: 'NOT_FOUND' }

    // Lazy-mark expired certs
    const today = new Date().toISOString().slice(0, 10)
    const detailLazyMarkNow = new Date().toISOString()
    await stub.execute(
      `UPDATE staff_certification SET status = 'expired', updated_at = ?
       WHERE staff_member_id = ? AND status = 'active'
         AND expires_at IS NOT NULL AND expires_at <= ?`,
      detailLazyMarkNow, data.staffMemberId, today,
    )

    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    type CertRow = {
      id: string; cert_type_id: string; cert_type_name: string
      cert_level_id: string | null; cert_level_name: string | null
      issued_at: string | null; expires_at: string | null
      cert_number: string | null; notes: string | null; status: string
    }
    const certRows = await stub.query(
      `SELECT sc.id, sc.cert_type_id, ct.name AS cert_type_name,
              sc.cert_level_id, cl.name AS cert_level_name,
              sc.issued_at, sc.expires_at, sc.cert_number, sc.notes, sc.status
       FROM staff_certification sc
       JOIN cert_type ct ON ct.id = sc.cert_type_id
       LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sc.staff_member_id = ?
       ORDER BY ct.name ASC`,
      data.staffMemberId,
    ) as CertRow[]
    const certs: StaffCertView[] = certRows.map((r) => ({
      id: r.id,
      staffMemberId: data.staffMemberId,
      certTypeId: r.cert_type_id,
      certTypeName: r.cert_type_name,
      certLevelId: r.cert_level_id,
      certLevelName: r.cert_level_name,
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
      certNumber: r.cert_number,
      notes: r.notes,
      status: r.status as StaffCertView['status'],
      isExpiringSoon:
        r.status === 'active' &&
        r.expires_at !== null &&
        r.expires_at > today &&
        r.expires_at <= soonStr,
    }))

    const staffMember: StaffMemberDetailView = {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: staff.role as StaffMemberDetailView['role'],
      status: staff.status,
      rankId: staff.rank_id,
      rankName: staff.rank_name,
      rankSortOrder: staff.rank_sort_order,
    }

    return { success: true, staffMember, certs }
  })

// ---------------------------------------------------------------------------
// I. Org-wide certification status
// ---------------------------------------------------------------------------

function orgToday(scheduleDayStart: string): string {
  const now = new Date()
  const [h, m] = scheduleDayStart.split(':').map(Number)
  const dayStartMs = ((h ?? 0) * 60 + (m ?? 0)) * 60 * 1000
  const utcMs = now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000
  const effectiveDate = utcMs < dayStartMs ? new Date(now.getTime() - 86400000) : now
  return effectiveDate.toISOString().slice(0, 10)
}

export const listOrgCertsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListOrgCertsInput) => d)
  .handler(async (ctx): Promise<ListOrgCertsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership || !canDo(membership.role, 'view-certifications')) {
      return { success: false, error: 'UNAUTHORIZED' }
    }

    const settingsStub = getOrgStub(env, membership.orgId)
    const settingsRows = await settingsStub.query(
      `SELECT schedule_day_start FROM org_settings WHERE id = 'settings'`,
    ) as { schedule_day_start: string }[]
    const today = orgToday(settingsRows[0]?.schedule_day_start ?? '00:00')

    const soonDate = new Date(today + 'T00:00:00Z')
    soonDate.setUTCDate(soonDate.getUTCDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    type OrgCertRow = {
      id: string
      staff_member_id: string
      staff_member_name: string
      cert_type_id: string
      cert_type_name: string
      cert_level_id: string | null
      cert_level_name: string | null
      issued_at: string | null
      expires_at: string | null
      cert_number: string | null
      notes: string | null
      status: string
    }

    function mapOrgCert(r: OrgCertRow): OrgCertView {
      return {
        id: r.id,
        staffMemberId: r.staff_member_id,
        staffMemberName: r.staff_member_name,
        certTypeId: r.cert_type_id,
        certTypeName: r.cert_type_name,
        certLevelId: r.cert_level_id,
        certLevelName: r.cert_level_name,
        issuedAt: r.issued_at,
        expiresAt: r.expires_at,
        certNumber: r.cert_number,
        notes: r.notes,
        status: r.status as OrgCertView['status'],
        isExpiringSoon:
          r.status === 'active' &&
          r.expires_at !== null &&
          r.expires_at > today &&
          r.expires_at <= soonStr,
      }
    }

    const stub = getOrgStub(env, membership.orgId)
    const rows = await stub.query(
      `SELECT sc.id, sc.staff_member_id, sm.name AS staff_member_name,
              sc.cert_type_id, ct.name AS cert_type_name,
              sc.cert_level_id, cl.name AS cert_level_name,
              sc.issued_at, sc.expires_at, sc.cert_number, sc.notes, sc.status
       FROM staff_certification sc
       JOIN staff_member sm ON sm.id = sc.staff_member_id
       JOIN cert_type ct ON ct.id = sc.cert_type_id
       LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sm.status != 'removed'
       ORDER BY sm.name ASC, ct.name ASC`,
    ) as OrgCertRow[]
    return { success: true, certs: rows.map(mapOrgCert) }
  })
