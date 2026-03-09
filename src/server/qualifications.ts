import { createServerFn } from '@tanstack/react-start'
import { canDo } from '@/lib/rbac'
import { requireOrgMembership } from '@/server/_helpers'
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

    type Row = { id: string; name: string; sort_order: number }
    const rows = await env.DB.prepare(
      `SELECT id, name, sort_order FROM rank WHERE org_id = ? ORDER BY sort_order ASC`,
    )
      .bind(membership.orgId)
      .all<Row>()

    const ranks: RankView[] = (rows.results ?? []).map((r) => ({
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

    try {
      await env.DB.prepare(
        `INSERT INTO rank (id, org_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, membership.orgId, name, data.sortOrder, now, now)
        .run()
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

    type Row = { id: string; name: string; sort_order: number }
    const existing = await env.DB.prepare(
      `SELECT id, name, sort_order FROM rank WHERE id = ? AND org_id = ?`,
    )
      .bind(data.rankId, membership.orgId)
      .first<Row>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const name = data.name !== undefined ? data.name.trim() : existing.name
    const sortOrder = data.sortOrder ?? existing.sort_order

    try {
      await env.DB.prepare(
        `UPDATE rank SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(name, sortOrder, new Date().toISOString(), data.rankId)
        .run()
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

    type Row = { id: string }
    const existing = await env.DB.prepare(`SELECT id FROM rank WHERE id = ? AND org_id = ?`)
      .bind(data.rankId, membership.orgId)
      .first<Row>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    // Check if any staff or position uses this rank
    type CountRow = { n: number }
    const usedByStaff = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM staff_member WHERE rank_id = ?`,
    )
      .bind(data.rankId)
      .first<CountRow>()
    const usedByPosition = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM position WHERE min_rank_id = ?`,
    )
      .bind(data.rankId)
      .first<CountRow>()

    if ((usedByStaff?.n ?? 0) > 0 || (usedByPosition?.n ?? 0) > 0) {
      return { success: false, error: 'IN_USE' }
    }

    await env.DB.prepare(`DELETE FROM rank WHERE id = ?`).bind(data.rankId).run()
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

    type TypeRow = { id: string; name: string; description: string | null; is_leveled: number }
    const typeRows = await env.DB.prepare(
      `SELECT id, name, description, is_leveled FROM cert_type WHERE org_id = ? ORDER BY name ASC`,
    )
      .bind(membership.orgId)
      .all<TypeRow>()

    const types = typeRows.results ?? []
    if (types.length === 0) return { success: true, certTypes: [] }

    type LevelRow = {
      id: string
      cert_type_id: string
      name: string
      level_order: number
    }
    const levelRows = await env.DB.prepare(
      `SELECT id, cert_type_id, name, level_order
       FROM cert_level
       WHERE cert_type_id IN (${types.map(() => '?').join(',')})
       ORDER BY cert_type_id, level_order ASC`,
    )
      .bind(...types.map((t) => t.id))
      .all<LevelRow>()

    const levelsByType = new Map<string, CertLevelView[]>()
    for (const l of levelRows.results ?? []) {
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

    try {
      const stmts: D1PreparedStatement[] = [
        env.DB.prepare(
          `INSERT INTO cert_type (id, org_id, name, description, is_leveled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id,
          membership.orgId,
          name,
          data.description?.trim() || null,
          data.isLeveled ? 1 : 0,
          now,
          now,
        ),
      ]

      const levels: CertLevelView[] = []
      if (data.isLeveled && data.levels) {
        for (const l of data.levels) {
          const levelId = crypto.randomUUID()
          stmts.push(
            env.DB.prepare(
              `INSERT INTO cert_level (id, cert_type_id, name, level_order, created_at) VALUES (?, ?, ?, ?, ?)`,
            ).bind(levelId, id, l.name.trim(), l.levelOrder, now),
          )
          levels.push({ id: levelId, certTypeId: id, name: l.name.trim(), levelOrder: l.levelOrder })
        }
      }

      await env.DB.batch(stmts)

      const certType: CertTypeView = {
        id,
        name,
        description: data.description?.trim() || null,
        isLeveled: data.isLeveled,
        levels,
      }
      return { success: true, certType }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE')) return { success: false, error: 'DUPLICATE' }
      throw e
    }
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

    type Row = { id: string; name: string; description: string | null }
    const existing = await env.DB.prepare(
      `SELECT id, name, description FROM cert_type WHERE id = ? AND org_id = ?`,
    )
      .bind(data.certTypeId, membership.orgId)
      .first<Row>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const name = data.name !== undefined ? data.name.trim() : existing.name
    const description = data.description !== undefined ? data.description : existing.description

    try {
      await env.DB.prepare(
        `UPDATE cert_type SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(name, description, new Date().toISOString(), data.certTypeId)
        .run()
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

    type TypeRow = { id: string; is_leveled: number }
    const certType = await env.DB.prepare(
      `SELECT id, is_leveled FROM cert_type WHERE id = ? AND org_id = ?`,
    )
      .bind(data.certTypeId, membership.orgId)
      .first<TypeRow>()

    if (!certType) return { success: false, error: 'NOT_FOUND' }

    // Get existing levels
    type LevelRow = { id: string; level_order: number }
    const existingRows = await env.DB.prepare(
      `SELECT id, level_order FROM cert_level WHERE cert_type_id = ? ORDER BY level_order ASC`,
    )
      .bind(data.certTypeId)
      .all<LevelRow>()

    const existing = existingRows.results ?? []
    const newOrders = new Set(data.levels.map((l) => l.levelOrder))
    const existingByOrder = new Map(existing.map((e) => [e.level_order, e.id]))

    // Find level IDs that would be deleted (in DB but not in new list)
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
      const usedInCerts = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM staff_certification WHERE cert_level_id IN (${placeholders})`,
      )
        .bind(...toDeleteIds)
        .first<CountRow>()
      const usedInReqs = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM position_cert_requirement WHERE min_cert_level_id IN (${placeholders})`,
      )
        .bind(...toDeleteIds)
        .first<CountRow>()

      if ((usedInCerts?.n ?? 0) > 0 || (usedInReqs?.n ?? 0) > 0) {
        return { success: false, error: 'LEVELS_IN_USE' }
      }
    }

    const now = new Date().toISOString()
    const stmts: D1PreparedStatement[] = []

    // Delete removed levels
    for (const id of toDeleteIds) {
      stmts.push(env.DB.prepare(`DELETE FROM cert_level WHERE id = ?`).bind(id))
    }

    const resultLevels: CertLevelView[] = []

    // Update or insert levels
    for (const l of data.levels) {
      const existingId = existingByOrder.get(l.levelOrder)
      if (existingId) {
        // Update name for existing level
        stmts.push(
          env.DB.prepare(`UPDATE cert_level SET name = ? WHERE id = ?`).bind(
            l.name.trim(),
            existingId,
          ),
        )
        resultLevels.push({
          id: existingId,
          certTypeId: data.certTypeId,
          name: l.name.trim(),
          levelOrder: l.levelOrder,
        })
      } else {
        // Insert new level
        const newId = crypto.randomUUID()
        stmts.push(
          env.DB.prepare(
            `INSERT INTO cert_level (id, cert_type_id, name, level_order, created_at) VALUES (?, ?, ?, ?, ?)`,
          ).bind(newId, data.certTypeId, l.name.trim(), l.levelOrder, now),
        )
        resultLevels.push({
          id: newId,
          certTypeId: data.certTypeId,
          name: l.name.trim(),
          levelOrder: l.levelOrder,
        })
      }
    }

    if (stmts.length > 0) {
      await env.DB.batch(stmts)
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

    type Row = { id: string }
    const existing = await env.DB.prepare(
      `SELECT id FROM cert_type WHERE id = ? AND org_id = ?`,
    )
      .bind(data.certTypeId, membership.orgId)
      .first<Row>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    type CountRow = { n: number }
    const used = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM staff_certification WHERE cert_type_id = ?`,
    )
      .bind(data.certTypeId)
      .first<CountRow>()

    if ((used?.n ?? 0) > 0) return { success: false, error: 'IN_USE' }

    await env.DB.prepare(`DELETE FROM cert_type WHERE id = ?`).bind(data.certTypeId).run()
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

    // Allow if manage/view-certifications, or if caller's own staff record
    const canView = canDo(membership.role, 'view-certifications')
    if (!canView) {
      // Check if the staffMemberId belongs to this user
      type StaffRow = { id: string }
      const ownRecord = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE id = ? AND org_id = ? AND user_id = ?`,
      )
        .bind(data.staffMemberId, membership.orgId, membership.userId)
        .first<StaffRow>()
      if (!ownRecord) return { success: false, error: 'UNAUTHORIZED' }
    }

    // Verify staff member exists in this org
    type StaffRow = { id: string }
    const staffMember = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE id = ? AND org_id = ?`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()
    if (!staffMember) return { success: false, error: 'NOT_FOUND' }

    // Lazy-mark expired certs
    const today = new Date().toISOString().slice(0, 10)
    await env.DB.prepare(
      `UPDATE staff_certification SET status = 'expired', updated_at = ?
       WHERE staff_member_id = ? AND status = 'active'
         AND expires_at IS NOT NULL AND expires_at <= ?`,
    )
      .bind(new Date().toISOString(), data.staffMemberId, today)
      .run()

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
    const rows = await env.DB.prepare(
      `SELECT sc.id, sc.cert_type_id, ct.name AS cert_type_name,
              sc.cert_level_id, cl.name AS cert_level_name,
              sc.issued_at, sc.expires_at, sc.cert_number, sc.notes, sc.status
       FROM staff_certification sc
       JOIN cert_type ct ON ct.id = sc.cert_type_id
       LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sc.staff_member_id = ? AND sc.org_id = ?
       ORDER BY ct.name ASC`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .all<CertRow>()

    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    const certs: StaffCertView[] = (rows.results ?? []).map((r) => ({
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

    // Verify staff member exists in this org
    type StaffRow = { id: string }
    const staffMember = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()
    if (!staffMember) return { success: false, error: 'NOT_FOUND' }

    // Verify cert type exists in this org
    type TypeRow = { id: string; name: string; is_leveled: number }
    const certType = await env.DB.prepare(
      `SELECT id, name, is_leveled FROM cert_type WHERE id = ? AND org_id = ?`,
    )
      .bind(data.certTypeId, membership.orgId)
      .first<TypeRow>()
    if (!certType) return { success: false, error: 'NOT_FOUND' }

    // Validate certLevelId belongs to certType
    let certLevelName: string | null = null
    if (data.certLevelId) {
      if (certType.is_leveled !== 1) {
        return { success: false, error: 'VALIDATION_ERROR' }
      }
      type LevelRow = { id: string; name: string }
      const level = await env.DB.prepare(
        `SELECT id, name FROM cert_level WHERE id = ? AND cert_type_id = ?`,
      )
        .bind(data.certLevelId, data.certTypeId)
        .first<LevelRow>()
      if (!level) return { success: false, error: 'VALIDATION_ERROR' }
      certLevelName = level.name
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO staff_certification
         (id, org_id, staff_member_id, cert_type_id, cert_level_id,
          issued_at, expires_at, cert_number, notes, status, added_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
       ON CONFLICT(staff_member_id, cert_type_id) DO UPDATE SET
         cert_level_id = excluded.cert_level_id,
         issued_at     = excluded.issued_at,
         expires_at    = excluded.expires_at,
         cert_number   = excluded.cert_number,
         notes         = excluded.notes,
         status        = 'active',
         added_by      = excluded.added_by,
         updated_at    = excluded.updated_at`,
    )
      .bind(
        id,
        membership.orgId,
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
      .run()

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
    const certRow = await env.DB.prepare(
      `SELECT id, cert_level_id, issued_at, expires_at, cert_number, notes, status
       FROM staff_certification
       WHERE staff_member_id = ? AND cert_type_id = ?`,
    )
      .bind(data.staffMemberId, data.certTypeId)
      .first<CertRow>()

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

    type Row = { id: string }
    const existing = await env.DB.prepare(
      `SELECT sc.id FROM staff_certification sc
       JOIN staff_member sm ON sm.id = sc.staff_member_id
       WHERE sc.staff_member_id = ? AND sc.cert_type_id = ? AND sc.org_id = ?`,
    )
      .bind(data.staffMemberId, data.certTypeId, membership.orgId)
      .first<Row>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    await env.DB.prepare(
      `UPDATE staff_certification SET status = 'revoked', updated_at = ? WHERE id = ?`,
    )
      .bind(new Date().toISOString(), existing.id)
      .run()

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
  type PosRow = {
    id: string
    name: string
    description: string | null
    min_rank_id: string | null
    min_rank_name: string | null
    sort_order: number
  }
  const pos = await env.DB.prepare(
    `SELECT p.id, p.name, p.description, p.min_rank_id, p.sort_order, r.name AS min_rank_name
     FROM position p
     LEFT JOIN rank r ON r.id = p.min_rank_id
     WHERE p.id = ? AND p.org_id = ?`,
  )
    .bind(positionId, orgId)
    .first<PosRow>()

  if (!pos) return null

  type ReqRow = {
    id: string
    cert_type_id: string
    cert_type_name: string
    min_cert_level_id: string | null
    min_cert_level_name: string | null
  }
  const reqRows = await env.DB.prepare(
    `SELECT pcr.id, pcr.cert_type_id, ct.name AS cert_type_name,
            pcr.min_cert_level_id, cl.name AS min_cert_level_name
     FROM position_cert_requirement pcr
     JOIN cert_type ct ON ct.id = pcr.cert_type_id
     LEFT JOIN cert_level cl ON cl.id = pcr.min_cert_level_id
     WHERE pcr.position_id = ?`,
  )
    .bind(positionId)
    .all<ReqRow>()

  return {
    id: pos.id,
    name: pos.name,
    description: pos.description,
    minRankId: pos.min_rank_id,
    minRankName: pos.min_rank_name,
    sortOrder: pos.sort_order,
    requirements: (reqRows.results ?? []).map((r) => ({
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

    type PosRow = {
      id: string
      name: string
      description: string | null
      min_rank_id: string | null
      min_rank_name: string | null
      sort_order: number
    }
    const posRows = await env.DB.prepare(
      `SELECT p.id, p.name, p.description, p.min_rank_id, p.sort_order, r.name AS min_rank_name
       FROM position p
       LEFT JOIN rank r ON r.id = p.min_rank_id
       WHERE p.org_id = ?
       ORDER BY p.sort_order DESC, p.name ASC`,
    )
      .bind(membership.orgId)
      .all<PosRow>()

    const posList = posRows.results ?? []
    if (posList.length === 0) return { success: true, positions: [] }

    type ReqRow = {
      id: string
      position_id: string
      cert_type_id: string
      cert_type_name: string
      min_cert_level_id: string | null
      min_cert_level_name: string | null
    }
    const reqRows = await env.DB.prepare(
      `SELECT pcr.id, pcr.position_id, pcr.cert_type_id, ct.name AS cert_type_name,
              pcr.min_cert_level_id, cl.name AS min_cert_level_name
       FROM position_cert_requirement pcr
       JOIN cert_type ct ON ct.id = pcr.cert_type_id
       LEFT JOIN cert_level cl ON cl.id = pcr.min_cert_level_id
       WHERE pcr.position_id IN (${posList.map(() => '?').join(',')})`,
    )
      .bind(...posList.map((p) => p.id))
      .all<ReqRow>()

    const reqsByPos = new Map<string, PositionView['requirements']>()
    for (const r of reqRows.results ?? []) {
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

    try {
      const sortOrder = data.sortOrder ?? 0

      const stmts: D1PreparedStatement[] = [
        env.DB.prepare(
          `INSERT INTO position (id, org_id, name, description, min_rank_id, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id,
          membership.orgId,
          name,
          data.description?.trim() || null,
          data.minRankId ?? null,
          sortOrder,
          now,
          now,
        ),
      ]

      for (const req of data.requirements ?? []) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO position_cert_requirement (id, position_id, cert_type_id, min_cert_level_id, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            id,
            req.certTypeId,
            req.minCertLevelId ?? null,
            now,
          ),
        )
      }

      await env.DB.batch(stmts)
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

    type PosRow = { id: string; name: string; description: string | null; min_rank_id: string | null; sort_order: number }
    const existing = await env.DB.prepare(
      `SELECT id, name, description, min_rank_id, sort_order FROM position WHERE id = ? AND org_id = ?`,
    )
      .bind(data.positionId, membership.orgId)
      .first<PosRow>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    const name = data.name !== undefined ? data.name.trim() : existing.name
    const description = data.description !== undefined ? data.description : existing.description
    const minRankId = data.minRankId !== undefined ? data.minRankId : existing.min_rank_id
    const sortOrder = data.sortOrder !== undefined ? data.sortOrder : existing.sort_order
    const now = new Date().toISOString()

    try {
      const stmts: D1PreparedStatement[] = [
        env.DB.prepare(
          `UPDATE position SET name = ?, description = ?, min_rank_id = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        ).bind(name, description, minRankId, sortOrder, now, data.positionId),
      ]

      if (data.requirements !== undefined) {
        // Replace requirements: delete all + insert new
        stmts.push(
          env.DB.prepare(`DELETE FROM position_cert_requirement WHERE position_id = ?`).bind(
            data.positionId,
          ),
        )
        for (const req of data.requirements) {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO position_cert_requirement (id, position_id, cert_type_id, min_cert_level_id, created_at)
               VALUES (?, ?, ?, ?, ?)`,
            ).bind(
              crypto.randomUUID(),
              data.positionId,
              req.certTypeId,
              req.minCertLevelId ?? null,
              now,
            ),
          )
        }
      }

      await env.DB.batch(stmts)
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

    type Row = { id: string }
    const existing = await env.DB.prepare(
      `SELECT id FROM position WHERE id = ? AND org_id = ?`,
    )
      .bind(data.positionId, membership.orgId)
      .first<Row>()

    if (!existing) return { success: false, error: 'NOT_FOUND' }

    type CountRow = { n: number }
    const inUse = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM shift_assignment WHERE position_id = ?`,
    )
      .bind(data.positionId)
      .first<CountRow>()

    if ((inUse?.n ?? 0) > 0) return { success: false, error: 'IN_USE' }

    await env.DB.prepare(`DELETE FROM position WHERE id = ?`).bind(data.positionId).run()
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

    type StaffRow = { id: string; name: string; rank_id: string | null }
    const staff = await env.DB.prepare(
      `SELECT id, name, rank_id FROM staff_member WHERE id = ? AND org_id = ? AND status != 'removed'`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()

    if (!staff) return { success: false, error: 'NOT_FOUND' }

    // If setting a rank, verify it belongs to this org
    if (data.rankId !== null) {
      type RankRow = { id: string; name: string }
      const rank = await env.DB.prepare(`SELECT id, name FROM rank WHERE id = ? AND org_id = ?`)
        .bind(data.rankId, membership.orgId)
        .first<RankRow>()
      if (!rank) return { success: false, error: 'NOT_FOUND' }
    }

    const now = new Date().toISOString()

    await env.DB.batch([
      env.DB.prepare(`UPDATE staff_member SET rank_id = ?, updated_at = ? WHERE id = ?`).bind(
        data.rankId,
        now,
        data.staffMemberId,
      ),
      env.DB.prepare(
        `INSERT INTO staff_audit_log (id, org_id, staff_member_id, performed_by, action, metadata, created_at)
         VALUES (?, ?, ?, ?, 'rank_changed', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        membership.orgId,
        data.staffMemberId,
        membership.userId,
        JSON.stringify({ previousRankId: staff.rank_id, newRankId: data.rankId }),
        now,
      ),
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

  type PosRow = {
    min_rank_id: string | null
    min_rank_sort_order: number | null
    min_rank_name: string | null
  }
  const pos = await env.DB.prepare(
    `SELECT p.min_rank_id, r.sort_order AS min_rank_sort_order, r.name AS min_rank_name
     FROM position p
     LEFT JOIN rank r ON r.id = p.min_rank_id
     WHERE p.id = ? AND p.org_id = ?`,
  )
    .bind(positionId, orgId)
    .first<PosRow>()

  if (!pos) return warnings

  type StaffRow = {
    rank_id: string | null
    rank_sort_order: number | null
    rank_name: string | null
  }
  const staff = await env.DB.prepare(
    `SELECT sm.rank_id, r.sort_order AS rank_sort_order, r.name AS rank_name
     FROM staff_member sm
     LEFT JOIN rank r ON r.id = sm.rank_id
     WHERE sm.id = ? AND sm.org_id = ?`,
  )
    .bind(staffMemberId, orgId)
    .first<StaffRow>()

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
  const reqRows = await env.DB.prepare(
    `SELECT pcr.cert_type_id, ct.name AS cert_type_name,
            pcr.min_cert_level_id, cl.level_order AS min_level_order,
            cl.name AS min_cert_level_name
     FROM position_cert_requirement pcr
     JOIN cert_type ct ON ct.id = pcr.cert_type_id
     LEFT JOIN cert_level cl ON cl.id = pcr.min_cert_level_id
     WHERE pcr.position_id = ?`,
  )
    .bind(positionId)
    .all<ReqRow>()

  for (const req of reqRows.results ?? []) {
    type CertRow = {
      status: string
      expires_at: string | null
      level_order: number | null
    }
    const cert = await env.DB.prepare(
      `SELECT sc.status, sc.expires_at, cl.level_order
       FROM staff_certification sc
       LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sc.staff_member_id = ? AND sc.cert_type_id = ?`,
    )
      .bind(staffMemberId, req.cert_type_id)
      .first<CertRow>()

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

    type PosRow = {
      id: string
      name: string
      min_rank_id: string | null
      min_rank_sort_order: number | null
      min_rank_name: string | null
    }
    const pos = await env.DB.prepare(
      `SELECT p.id, p.name, p.min_rank_id, r.sort_order AS min_rank_sort_order, r.name AS min_rank_name
       FROM position p
       LEFT JOIN rank r ON r.id = p.min_rank_id
       WHERE p.id = ? AND p.org_id = ?`,
    )
      .bind(data.positionId, membership.orgId)
      .first<PosRow>()

    if (!pos) return { success: false, error: 'NOT_FOUND' }

    type ReqRow = {
      cert_type_id: string
      min_cert_level_id: string | null
      min_level_order: number | null
    }
    const reqRows = await env.DB.prepare(
      `SELECT pcr.cert_type_id, pcr.min_cert_level_id, cl.level_order AS min_level_order
       FROM position_cert_requirement pcr
       LEFT JOIN cert_level cl ON cl.id = pcr.min_cert_level_id
       WHERE pcr.position_id = ?`,
    )
      .bind(data.positionId)
      .all<ReqRow>()

    const requirements = reqRows.results ?? []

    // Get all active staff with rank info
    type StaffRow = {
      id: string
      name: string
      rank_id: string | null
      rank_sort_order: number | null
      rank_name: string | null
    }
    const staffRows = await env.DB.prepare(
      `SELECT sm.id, sm.name, sm.rank_id, r.sort_order AS rank_sort_order, r.name AS rank_name
       FROM staff_member sm
       LEFT JOIN rank r ON r.id = sm.rank_id
       WHERE sm.org_id = ? AND sm.status != 'removed'
       ORDER BY sm.name ASC`,
    )
      .bind(membership.orgId)
      .all<StaffRow>()

    const allStaff = staffRows.results ?? []
    if (allStaff.length === 0) return { success: true, eligible: [], positionName: pos.name }

    // Get all active certs for these staff (not expired as of asOfDate)
    type CertRow = {
      staff_member_id: string
      cert_type_id: string
      expires_at: string | null
      level_order: number | null
    }
    const certRows = await env.DB.prepare(
      `SELECT sc.staff_member_id, sc.cert_type_id, sc.expires_at, cl.level_order
       FROM staff_certification sc
       LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sc.org_id = ? AND sc.status = 'active'
         AND (sc.expires_at IS NULL OR sc.expires_at > ?)`,
    )
      .bind(membership.orgId, data.asOfDate)
      .all<CertRow>()

    // Also get certs expiring soon for isExpiringSoon flag
    const soonDate = new Date(data.asOfDate + 'T00:00:00')
    soonDate.setDate(soonDate.getDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    // Build cert map: staffId → Map<certTypeId, {level_order, expires_at}>
    type CertInfo = { levelOrder: number | null; expiresAt: string | null }
    const certsByStaff = new Map<string, Map<string, CertInfo>>()
    for (const c of certRows.results ?? []) {
      if (!certsByStaff.has(c.staff_member_id)) certsByStaff.set(c.staff_member_id, new Map())
      certsByStaff.get(c.staff_member_id)!.set(c.cert_type_id, {
        levelOrder: c.level_order,
        expiresAt: c.expires_at,
      })
    }

    const eligible: EligibleStaffMember[] = []

    for (const staff of allStaff) {
      // Rank check
      if (pos.min_rank_id !== null) {
        if (
          staff.rank_id === null ||
          (staff.rank_sort_order ?? 0) < (pos.min_rank_sort_order ?? 1)
        ) {
          continue
        }
      }

      // Cert checks
      const staffCerts = certsByStaff.get(staff.id) ?? new Map<string, CertInfo>()
      let meetsAllCerts = true

      for (const req of requirements) {
        const cert = staffCerts.get(req.cert_type_id)
        if (!cert) { meetsAllCerts = false; break }
        if (req.min_cert_level_id !== null && req.min_level_order !== null) {
          if (cert.levelOrder === null || cert.levelOrder < req.min_level_order) {
            meetsAllCerts = false
            break
          }
        }
      }

      if (!meetsAllCerts) continue

      // Check if any cert is expiring soon
      let hasExpiringCerts = false
      for (const [, certInfo] of staffCerts) {
        if (certInfo.expiresAt !== null && certInfo.expiresAt <= soonStr) {
          hasExpiringCerts = true
          break
        }
      }

      // Build certs summary
      const certNames: string[] = []
      for (const [typeId, certInfo] of staffCerts) {
        // Only include certs relevant to this position
        if (requirements.length > 0 && !requirements.some((r) => r.cert_type_id === typeId)) {
          continue
        }
        certNames.push(typeId) // We don't have the name here; use type ID as placeholder
      }
      // We'll use a simple count for the summary
      const certsSummary = `${staffCerts.size} cert${staffCerts.size !== 1 ? 's' : ''}`

      eligible.push({
        staffMemberId: staff.id,
        name: staff.name,
        rankName: staff.rank_name,
        certsSummary,
        hasExpiringCerts,
        constraintType: null,
      })
    }

    // Fetch availability constraints for eligible staff on the target date
    if (eligible.length > 0) {
      const eligibleIds = eligible.map((e) => e.staffMemberId)
      const placeholders = eligibleIds.map(() => '?').join(',')
      // Query constraints that overlap the target date (entire day)
      const dayStart = data.asOfDate + 'T00:00:00'
      const dayEnd = data.asOfDate + 'T23:59:59'
      type ConstraintRow = {
        staff_member_id: string
        type: string
        start_datetime: string
        end_datetime: string
        days_of_week: string | null
      }
      const constraintRows = await env.DB.prepare(
        `SELECT staff_member_id, type, start_datetime, end_datetime, days_of_week
         FROM staff_constraint
         WHERE org_id = ? AND staff_member_id IN (${placeholders})
           AND status = 'approved'
           AND start_datetime < ? AND end_datetime > ?`,
      )
        .bind(membership.orgId, ...eligibleIds, dayEnd, dayStart)
        .all<ConstraintRow>()

      // Map: staffMemberId → most restrictive constraint type
      // Priority: time_off/unavailable > not_preferred > preferred
      const constraintPriority: Record<string, number> = {
        time_off: 3,
        unavailable: 3,
        not_preferred: 2,
        preferred: 1,
      }
      const staffConstraintMap = new Map<string, string>()
      const targetDayOfWeek = new Date(data.asOfDate + 'T00:00:00').getDay()

      for (const row of constraintRows.results) {
        // For recurring constraints, check day-of-week match
        if (row.days_of_week !== null) {
          const days: number[] = JSON.parse(row.days_of_week)
          if (!days.includes(targetDayOfWeek)) continue
        }
        const existing = staffConstraintMap.get(row.staff_member_id)
        const existingPriority = existing ? (constraintPriority[existing] ?? 0) : 0
        const newPriority = constraintPriority[row.type] ?? 0
        if (newPriority > existingPriority) {
          staffConstraintMap.set(row.staff_member_id, row.type)
        }
      }

      for (const member of eligible) {
        const ct = staffConstraintMap.get(member.staffMemberId)
        if (ct === 'time_off' || ct === 'unavailable' || ct === 'preferred' || ct === 'not_preferred') {
          member.constraintType = ct
        }
      }
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

    type Row = {
      staff_member_id: string
      staff_member_name: string
      cert_type_name: string
      expires_at: string
    }
    const rows = await env.DB.prepare(
      `SELECT sc.staff_member_id, sm.name AS staff_member_name,
              ct.name AS cert_type_name, sc.expires_at
       FROM staff_certification sc
       JOIN staff_member sm ON sm.id = sc.staff_member_id
       JOIN cert_type ct ON ct.id = sc.cert_type_id
       WHERE sc.org_id = ? AND sc.status = 'active'
         AND sc.expires_at IS NOT NULL
         AND sc.expires_at > ? AND sc.expires_at <= ?
         AND sm.status != 'removed'
       ORDER BY sc.expires_at ASC`,
    )
      .bind(membership.orgId, today, soonStr)
      .all<Row>()

    const certs: ExpiringCertView[] = (rows.results ?? []).map((r) => {
      const expDate = new Date(r.expires_at + 'T00:00:00')
      const todayDate = new Date(today + 'T00:00:00')
      const daysUntilExpiry = Math.ceil(
        (expDate.getTime() - todayDate.getTime()) / 86400000,
      )
      return {
        staffMemberId: r.staff_member_id,
        staffMemberName: r.staff_member_name,
        certTypeName: r.cert_type_name,
        expiresAt: r.expires_at,
        daysUntilExpiry,
      }
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

    const canView = canDo(membership.role, 'view-certifications')
    if (!canView) {
      // Only allow viewing own record
      type OwnRow = { id: string }
      const own = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE id = ? AND org_id = ? AND user_id = ?`,
      )
        .bind(data.staffMemberId, membership.orgId, membership.userId)
        .first<OwnRow>()
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
    const staff = await env.DB.prepare(
      `SELECT sm.id, sm.name, sm.email, sm.phone, sm.role, sm.status,
              sm.rank_id, r.name AS rank_name, r.sort_order AS rank_sort_order
       FROM staff_member sm
       LEFT JOIN rank r ON r.id = sm.rank_id
       WHERE sm.id = ? AND sm.org_id = ?`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .first<StaffRow>()

    if (!staff) return { success: false, error: 'NOT_FOUND' }

    // Lazy-mark expired certs
    const today = new Date().toISOString().slice(0, 10)
    await env.DB.prepare(
      `UPDATE staff_certification SET status = 'expired', updated_at = ?
       WHERE staff_member_id = ? AND status = 'active'
         AND expires_at IS NOT NULL AND expires_at <= ?`,
    )
      .bind(new Date().toISOString(), data.staffMemberId, today)
      .run()

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
    const certRows = await env.DB.prepare(
      `SELECT sc.id, sc.cert_type_id, ct.name AS cert_type_name,
              sc.cert_level_id, cl.name AS cert_level_name,
              sc.issued_at, sc.expires_at, sc.cert_number, sc.notes, sc.status
       FROM staff_certification sc
       JOIN cert_type ct ON ct.id = sc.cert_type_id
       LEFT JOIN cert_level cl ON cl.id = sc.cert_level_id
       WHERE sc.staff_member_id = ? AND sc.org_id = ?
       ORDER BY ct.name ASC`,
    )
      .bind(data.staffMemberId, membership.orgId)
      .all<CertRow>()

    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    const soonStr = soonDate.toISOString().slice(0, 10)

    const certs: StaffCertView[] = (certRows.results ?? []).map((r) => ({
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
