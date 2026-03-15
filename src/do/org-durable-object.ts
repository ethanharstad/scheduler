import { DurableObject } from 'cloudflare:workers'
import type { OrgRole, QuickShiftPreset } from '@/lib/org.types'
import type { StaffMemberView, StaffAuditAction, StaffAuditEntry } from '@/lib/staff.types'

// ---------------------------------------------------------------------------
// Schema SQL — read from co-located schema.sql at build time is not possible
// in DO context, so we inline the full schema as a constant.
// This MUST stay in sync with src/do/schema.sql.
// ---------------------------------------------------------------------------

import ORG_SCHEMA_SQL from './schema.sql?raw'

// ---------------------------------------------------------------------------
// Input / Output types for RPC methods
// ---------------------------------------------------------------------------

export type OrgSettingsView = {
  orgId: string
  slug: string
  name: string
  plan: string
  status: string
  scheduleDayStart: string
  quickShifts: QuickShiftPreset[]
  createdAt: string
}

export type AddStaffInput = {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: OrgRole
  userId: string | null
  addedBy: string | null
}

export type WriteAuditLogInput = {
  staffMemberId: string | null
  performedBy: string | null
  action: StaffAuditAction
  metadata?: Record<string, string>
}

export type StaffInvitationInput = {
  staffMemberId: string
  email: string
  token: string
  invitedBy: string | null
  expiresAt: string
}

export type AcceptInvitationDOInput = {
  token: string
  userId: string
}

export type ChangeStaffRoleInput = {
  staffMemberId: string
  newRole: OrgRole
}

export type MembershipInput = {
  id: string
  userId: string
  role: OrgRole
  joinedAt: string
}

// ---------------------------------------------------------------------------
// OrgDurableObject
// ---------------------------------------------------------------------------

export class OrgDurableObject extends DurableObject<Cloudflare.Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.ensureSchema()
  }

  private ensureSchema(): void {
    this.sql.exec(ORG_SCHEMA_SQL)
    // Additive migrations for existing DO instances
    try { this.sql.exec(`ALTER TABLE org_settings ADD COLUMN quick_shifts TEXT`) } catch { /* already exists */ }
    // Migrate shift_trade: make offering columns nullable + add coverage columns.
    // SQLite doesn't support ALTER COLUMN, so we recreate the table if needed.
    this.migrateShiftTradeTable()
  }

  private migrateShiftTradeTable(): void {
    // Check if migration is needed by looking for coverage_schedule_id column
    try {
      this.sql.exec(`SELECT coverage_schedule_id FROM shift_trade LIMIT 0`)
      return // Column exists — already migrated or fresh table
    } catch {
      // Column missing — need to migrate
    }

    // Recreate shift_trade with nullable offering fields and coverage columns
    this.sql.exec(`ALTER TABLE shift_trade RENAME TO shift_trade_old`)
    this.sql.exec(`CREATE TABLE shift_trade (
      id                      TEXT NOT NULL PRIMARY KEY,
      offering_assignment_id  TEXT REFERENCES shift_assignment(id) ON DELETE CASCADE,
      offering_staff_id       TEXT REFERENCES staff_member(id) ON DELETE CASCADE,
      offering_schedule_id    TEXT REFERENCES schedule(id) ON DELETE CASCADE,
      offering_start_datetime TEXT,
      offering_end_datetime   TEXT,
      receiving_assignment_id  TEXT REFERENCES shift_assignment(id) ON DELETE SET NULL,
      receiving_staff_id       TEXT REFERENCES staff_member(id) ON DELETE SET NULL,
      receiving_schedule_id    TEXT REFERENCES schedule(id) ON DELETE SET NULL,
      receiving_start_datetime TEXT,
      receiving_end_datetime   TEXT,
      coverage_schedule_id    TEXT REFERENCES schedule(id) ON DELETE CASCADE,
      coverage_position_id    TEXT REFERENCES position(id) ON DELETE SET NULL,
      coverage_position_name  TEXT,
      coverage_start_datetime TEXT,
      coverage_end_datetime   TEXT,
      coverage_notes          TEXT,
      created_by_staff_id     TEXT REFERENCES staff_member(id),
      trade_type       TEXT NOT NULL DEFAULT 'swap',
      status           TEXT NOT NULL DEFAULT 'pending_acceptance',
      is_open_board    INTEGER NOT NULL DEFAULT 0,
      reason           TEXT,
      denial_reason    TEXT,
      accepted_by      TEXT,
      accepted_at      TEXT,
      reviewer_id      TEXT,
      reviewed_at      TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      expires_at       TEXT,
      CHECK (trade_type IN ('swap', 'giveaway', 'coverage_request')),
      CHECK (status IN (
        'pending_acceptance', 'pending_approval',
        'approved', 'denied', 'withdrawn', 'expired', 'cancelled_system'
      ))
    )`)
    this.sql.exec(`INSERT INTO shift_trade (
      id, offering_assignment_id, offering_staff_id, offering_schedule_id,
      offering_start_datetime, offering_end_datetime,
      receiving_assignment_id, receiving_staff_id, receiving_schedule_id,
      receiving_start_datetime, receiving_end_datetime,
      trade_type, status, is_open_board, reason, denial_reason,
      accepted_by, accepted_at, reviewer_id, reviewed_at,
      created_at, updated_at, expires_at
    ) SELECT
      id, offering_assignment_id, offering_staff_id, offering_schedule_id,
      offering_start_datetime, offering_end_datetime,
      receiving_assignment_id, receiving_staff_id, receiving_schedule_id,
      receiving_start_datetime, receiving_end_datetime,
      trade_type, status, is_open_board, reason, denial_reason,
      accepted_by, accepted_at, reviewer_id, reviewed_at,
      created_at, updated_at, expires_at
    FROM shift_trade_old`)
    this.sql.exec(`DROP TABLE shift_trade_old`)
    // Recreate indexes
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_shift_trade_offering_staff ON shift_trade(offering_staff_id, status)`)
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_shift_trade_receiving_staff ON shift_trade(receiving_staff_id, status)`)
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_shift_trade_status ON shift_trade(status)`)
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_shift_trade_open_board ON shift_trade(is_open_board, status)`)
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_shift_trade_offering_assign ON shift_trade(offering_assignment_id)`)
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_shift_trade_coverage_sched ON shift_trade(coverage_schedule_id, status)`)
  }

  // =========================================================================
  // Generic SQL (used by Phase 3+ features to avoid per-method boilerplate)
  // =========================================================================

  /** Execute a read query and return rows as typed objects. */
  async query<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T[]> {
    return [...this.sql.exec(sql, ...params)] as T[]
  }

  /** Execute a single row read query. Returns null if no rows. */
  async queryOne<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T | null> {
    const rows = [...this.sql.exec(sql, ...params)] as T[]
    return rows[0] ?? null
  }

  /** Execute a mutation (INSERT/UPDATE/DELETE). */
  async execute(sql: string, ...params: unknown[]): Promise<void> {
    this.sql.exec(sql, ...params)
  }

  /** Execute multiple mutations sequentially (DO is single-threaded). */
  async executeBatch(
    statements: Array<{ sql: string; params: unknown[] }>,
  ): Promise<void> {
    for (const stmt of statements) {
      this.sql.exec(stmt.sql, ...stmt.params)
    }
  }

  // =========================================================================
  // Org Settings
  // =========================================================================

  async getSettings(): Promise<OrgSettingsView | null> {
    const rows = [...this.sql
      .exec('SELECT * FROM org_settings WHERE id = ?', 'settings')]
    const row = rows[0] as Record<string, unknown> | undefined
    if (!row) return null
    let quickShifts: QuickShiftPreset[] = []
    if (row['quick_shifts']) {
      try { quickShifts = JSON.parse(row['quick_shifts'] as string) as QuickShiftPreset[] } catch { /* ignore */ }
    }
    return {
      orgId: row['org_id'] as string,
      slug: row['slug'] as string,
      name: row['name'] as string,
      plan: row['plan'] as string,
      status: row['status'] as string,
      scheduleDayStart: row['schedule_day_start'] as string,
      quickShifts,
      createdAt: row['created_at'] as string,
    }
  }

  async initSettings(settings: {
    orgId: string
    slug: string
    name: string
    plan?: string
    scheduleDayStart?: string
    createdAt: string
  }): Promise<void> {
    this.sql.exec(
      `INSERT OR REPLACE INTO org_settings (id, org_id, slug, name, plan, status, schedule_day_start, created_at)
       VALUES ('settings', ?, ?, ?, ?, 'active', ?, ?)`,
      settings.orgId,
      settings.slug,
      settings.name,
      settings.plan ?? 'free',
      settings.scheduleDayStart ?? '00:00',
      settings.createdAt,
    )
  }

  async updateSettings(updates: {
    name?: string
    scheduleDayStart?: string
    quickShifts?: QuickShiftPreset[]
  }): Promise<void> {
    if (updates.name !== undefined) {
      this.sql.exec(
        `UPDATE org_settings SET name = ? WHERE id = 'settings'`,
        updates.name,
      )
    }
    if (updates.scheduleDayStart !== undefined) {
      this.sql.exec(
        `UPDATE org_settings SET schedule_day_start = ? WHERE id = 'settings'`,
        updates.scheduleDayStart,
      )
    }
    if (updates.quickShifts !== undefined) {
      this.sql.exec(
        `UPDATE org_settings SET quick_shifts = ? WHERE id = 'settings'`,
        JSON.stringify(updates.quickShifts),
      )
    }
  }

  // =========================================================================
  // Membership (source of truth in DO)
  // =========================================================================

  async upsertMembership(input: MembershipInput): Promise<void> {
    this.sql.exec(
      `INSERT INTO org_membership (id, user_id, role, status, joined_at)
       VALUES (?, ?, ?, 'active', ?)
       ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, status = 'active'`,
      input.id,
      input.userId,
      input.role,
      input.joinedAt,
    )
  }

  async listMemberships(): Promise<Array<{
    id: string
    userId: string
    role: OrgRole
    status: string
    joinedAt: string
  }>> {
    const rows = [
      ...this.sql.exec(
        `SELECT id, user_id, role, status, joined_at
         FROM org_membership
         WHERE status = 'active'
         ORDER BY joined_at ASC`,
      ),
    ] as Array<Record<string, unknown>>

    return rows.map((r) => ({
      id: r['id'] as string,
      userId: r['user_id'] as string,
      role: r['role'] as OrgRole,
      status: r['status'] as string,
      joinedAt: r['joined_at'] as string,
    }))
  }

  async deactivateMembership(userId: string): Promise<void> {
    this.sql.exec(
      `UPDATE org_membership SET status = 'inactive' WHERE user_id = ?`,
      userId,
    )
  }

  async updateMembershipRole(userId: string, newRole: OrgRole): Promise<void> {
    this.sql.exec(
      `UPDATE org_membership SET role = ? WHERE user_id = ? AND status = 'active'`,
      newRole,
      userId,
    )
  }

  // =========================================================================
  // Staff
  // =========================================================================

  async listStaff(): Promise<StaffMemberView[]> {
    const rows = [
      ...this.sql.exec(
        `SELECT sm.id, sm.name, sm.email, sm.phone, sm.role, sm.status, sm.user_id, sm.created_at, sm.updated_at,
                r.name AS rank_name, r.sort_order AS rank_sort_order,
                p.name AS platoon_name, p.color AS platoon_color
         FROM staff_member sm
         LEFT JOIN rank r ON r.id = sm.rank_id
         LEFT JOIN platoon_membership pm ON pm.staff_member_id = sm.id
         LEFT JOIN platoon p ON p.id = pm.platoon_id
         WHERE sm.status != 'removed'
         ORDER BY sm.name ASC`,
      ),
    ] as Array<Record<string, unknown>>

    return rows.map((r) => ({
      id: r['id'] as string,
      name: r['name'] as string,
      email: (r['email'] as string) ?? null,
      phone: (r['phone'] as string) ?? null,
      role: r['role'] as OrgRole,
      status: r['status'] as StaffMemberView['status'],
      userId: (r['user_id'] as string) ?? null,
      rankName: (r['rank_name'] as string) ?? null,
      rankSortOrder: (r['rank_sort_order'] as number) ?? null,
      platoonName: (r['platoon_name'] as string) ?? null,
      platoonColor: (r['platoon_color'] as string) ?? null,
      addedAt: r['created_at'] as string,
      updatedAt: r['updated_at'] as string,
    }))
  }

  async getStaffMember(staffId: string): Promise<StaffMemberView | null> {
    const row = this.sql
      .exec(
        `SELECT sm.id, sm.name, sm.email, sm.phone, sm.role, sm.status, sm.user_id, sm.created_at, sm.updated_at,
                r.name AS rank_name, r.sort_order AS rank_sort_order,
                p.name AS platoon_name, p.color AS platoon_color
         FROM staff_member sm
         LEFT JOIN rank r ON r.id = sm.rank_id
         LEFT JOIN platoon_membership pm ON pm.staff_member_id = sm.id
         LEFT JOIN platoon p ON p.id = pm.platoon_id
         WHERE sm.id = ?`,
        staffId,
      )
      .one() as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      email: (row['email'] as string) ?? null,
      phone: (row['phone'] as string) ?? null,
      role: row['role'] as OrgRole,
      status: row['status'] as StaffMemberView['status'],
      userId: (row['user_id'] as string) ?? null,
      rankName: (row['rank_name'] as string) ?? null,
      rankSortOrder: (row['rank_sort_order'] as number) ?? null,
      platoonName: (row['platoon_name'] as string) ?? null,
      platoonColor: (row['platoon_color'] as string) ?? null,
      addedAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    }
  }

  async addStaff(input: AddStaffInput): Promise<StaffMemberView> {
    const id = input.id
    const now = new Date().toISOString()

    this.sql.exec(
      `INSERT INTO staff_member (id, user_id, name, email, phone, role, status, added_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.userId,
      input.name,
      input.email,
      input.phone,
      input.role,
      input.userId ? 'active' : 'roster_only',
      input.addedBy,
      now,
      now,
    )

    return {
      id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      status: input.userId ? 'active' : 'roster_only',
      userId: input.userId,
      rankName: null,
      rankSortOrder: null,
      platoonName: null,
      platoonColor: null,
      addedAt: now,
      updatedAt: now,
    }
  }

  async staffEmailExists(email: string): Promise<boolean> {
    const row = this.sql
      .exec(
        `SELECT id FROM staff_member WHERE email = ? AND status != 'removed'`,
        email,
      )
      .one() as Record<string, unknown> | undefined
    return !!row
  }

  async updateStaffStatus(
    staffId: string,
    status: string,
    userId?: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    if (userId !== undefined) {
      this.sql.exec(
        `UPDATE staff_member SET status = ?, user_id = ?, updated_at = ? WHERE id = ?`,
        status,
        userId,
        now,
        staffId,
      )
    } else {
      this.sql.exec(
        `UPDATE staff_member SET status = ?, updated_at = ? WHERE id = ?`,
        status,
        now,
        staffId,
      )
    }
  }

  async updateStaffRole(staffId: string, newRole: OrgRole): Promise<void> {
    const now = new Date().toISOString()
    this.sql.exec(
      `UPDATE staff_member SET role = ?, updated_at = ? WHERE id = ?`,
      newRole,
      now,
      staffId,
    )
  }

  async updateStaffDetails(
    staffId: string,
    fields: { name?: string; email?: string | null; phone?: string | null },
  ): Promise<void> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name) }
    if ('email' in fields) { sets.push('email = ?'); params.push(fields.email ?? null) }
    if ('phone' in fields) { sets.push('phone = ?'); params.push(fields.phone ?? null) }
    params.push(staffId)
    this.sql.exec(`UPDATE staff_member SET ${sets.join(', ')} WHERE id = ?`, ...params)
  }

  async removeStaffMember(staffId: string): Promise<void> {
    const now = new Date().toISOString()
    this.sql.exec(
      `UPDATE staff_member SET status = 'removed', updated_at = ? WHERE id = ?`,
      now,
      staffId,
    )
    // Cancel pending invitations
    this.sql.exec(
      `UPDATE staff_invitation SET status = 'cancelled' WHERE staff_member_id = ? AND status = 'pending'`,
      staffId,
    )
  }

  async countActiveOwners(): Promise<number> {
    const row = this.sql
      .exec(
        `SELECT COUNT(*) AS count FROM staff_member WHERE role = 'owner' AND status = 'active'`,
      )
      .one() as Record<string, unknown> | undefined
    return (row?.['count'] as number) ?? 0
  }

  // =========================================================================
  // Staff Invitations
  // =========================================================================

  async createInvitation(input: StaffInvitationInput): Promise<void> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    this.sql.exec(
      `INSERT INTO staff_invitation (id, staff_member_id, email, token, invited_by, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      id,
      input.staffMemberId,
      input.email,
      input.token,
      input.invitedBy,
      input.expiresAt,
      now,
    )
    this.sql.exec(
      `UPDATE staff_member SET status = 'pending', updated_at = ? WHERE id = ?`,
      now,
      input.staffMemberId,
    )
  }

  async cancelInvitation(staffMemberId: string): Promise<string | null> {
    const row = this.sql
      .exec(
        `SELECT id, email FROM staff_invitation WHERE staff_member_id = ? AND status = 'pending'`,
        staffMemberId,
      )
      .one() as Record<string, unknown> | undefined
    if (!row) return null

    const now = new Date().toISOString()
    this.sql.exec(
      `UPDATE staff_invitation SET status = 'cancelled' WHERE id = ?`,
      row['id'] as string,
    )
    this.sql.exec(
      `UPDATE staff_member SET status = 'roster_only', updated_at = ? WHERE id = ?`,
      now,
      staffMemberId,
    )
    return row['email'] as string
  }

  async getPendingInvitation(
    staffMemberId: string,
  ): Promise<{ id: string; email: string } | null> {
    const row = this.sql
      .exec(
        `SELECT id, email FROM staff_invitation WHERE staff_member_id = ? AND status = 'pending'`,
        staffMemberId,
      )
      .one() as Record<string, unknown> | undefined
    if (!row) return null
    return { id: row['id'] as string, email: row['email'] as string }
  }

  async replaceInvitation(input: StaffInvitationInput): Promise<void> {
    // Cancel old invitation
    this.sql.exec(
      `UPDATE staff_invitation SET status = 'cancelled' WHERE staff_member_id = ? AND status = 'pending'`,
      input.staffMemberId,
    )
    // Create new
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.sql.exec(
      `INSERT INTO staff_invitation (id, staff_member_id, email, token, invited_by, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      id,
      input.staffMemberId,
      input.email,
      input.token,
      input.invitedBy,
      input.expiresAt,
      now,
    )
  }

  async acceptInvitation(input: AcceptInvitationDOInput): Promise<{
    staffMemberId: string
    email: string
    role: OrgRole
  } | null> {
    const row = this.sql
      .exec(
        `SELECT i.id, i.staff_member_id, i.email, sm.role
         FROM staff_invitation i
         JOIN staff_member sm ON sm.id = i.staff_member_id
         WHERE i.token = ? AND i.status = 'pending'`,
        input.token,
      )
      .one() as Record<string, unknown> | undefined
    if (!row) return null

    const now = new Date().toISOString()
    this.sql.exec(
      `UPDATE staff_invitation SET status = 'accepted' WHERE id = ?`,
      row['id'] as string,
    )
    this.sql.exec(
      `UPDATE staff_member SET status = 'active', user_id = ?, updated_at = ? WHERE id = ?`,
      input.userId,
      now,
      row['staff_member_id'] as string,
    )

    return {
      staffMemberId: row['staff_member_id'] as string,
      email: row['email'] as string,
      role: row['role'] as OrgRole,
    }
  }

  // =========================================================================
  // Audit Log
  // =========================================================================

  async writeAuditLog(entry: WriteAuditLogInput): Promise<void> {
    this.sql.exec(
      `INSERT INTO staff_audit_log (id, staff_member_id, performed_by, action, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      entry.staffMemberId,
      entry.performedBy,
      entry.action,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      new Date().toISOString(),
    )
  }

  // =========================================================================
  // Backup & Restore
  // =========================================================================

  /** Export all data from every table in the DO. */
  async exportAllData(): Promise<Record<string, unknown[]>> {
    const tables = [
      'org_settings', 'org_membership', 'station',
      'rank', 'cert_type', 'cert_level', 'position', 'position_cert_requirement',
      'staff_member', 'staff_invitation', 'staff_audit_log', 'staff_certification',
      'schedule', 'shift_assignment',
      'platoon', 'platoon_membership',
      'staff_constraint', 'schedule_requirement',
      'asset', 'asset_location', 'asset_inspection_schedule', 'asset_audit_log',
      'form_template', 'form_template_version', 'form_submission', 'form_response_value',
      'shift_trade', 'coverage_application',
    ]
    const result: Record<string, unknown[]> = {}
    for (const table of tables) {
      result[table] = [...this.sql.exec(`SELECT * FROM ${table}`)]
    }
    return result
  }

  /** Clear all data and import from a backup. Destructive operation. */
  async importAllData(data: Record<string, unknown[]>): Promise<void> {
    // Delete in child-first order to respect FK constraints
    const deleteOrder = [
      'form_response_value', 'form_submission', 'form_template_version',
      'asset_audit_log', 'asset_inspection_schedule', 'asset_location',
      'coverage_application', 'shift_trade', 'shift_assignment', 'schedule',
      'schedule_requirement', 'staff_constraint',
      'platoon_membership', 'platoon',
      'staff_certification', 'staff_audit_log', 'staff_invitation', 'staff_member',
      'position_cert_requirement', 'position', 'cert_level', 'cert_type', 'rank',
      'form_template',
      'station', 'org_membership', 'org_settings',
    ]

    // Insert in parent-first order
    const insertOrder = [
      'org_settings', 'org_membership', 'station',
      'rank', 'cert_type', 'cert_level', 'position', 'position_cert_requirement',
      'form_template', 'form_template_version',
      'staff_member', 'staff_invitation', 'staff_audit_log', 'staff_certification',
      'platoon', 'platoon_membership',
      'schedule', 'shift_assignment',
      'staff_constraint', 'schedule_requirement',
      'asset', 'asset_location', 'asset_inspection_schedule', 'asset_audit_log',
      'form_submission', 'form_response_value',
      'shift_trade', 'coverage_application',
    ]

    // Clear all tables
    for (const table of deleteOrder) {
      this.sql.exec(`DELETE FROM ${table}`)
    }

    // Insert backup data
    for (const table of insertOrder) {
      const rows = data[table] ?? []
      for (const row of rows) {
        const rec = row as Record<string, unknown>
        const keys = Object.keys(rec)
        if (keys.length === 0) continue
        const placeholders = keys.map(() => '?').join(', ')
        const values = keys.map((k) => rec[k])
        this.sql.exec(
          `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
          ...values,
        )
      }
    }
  }

  // =========================================================================
  // Audit Log
  // =========================================================================

  async getAuditLog(limit: number, offset: number): Promise<{
    entries: StaffAuditEntry[]
    total: number
  }> {
    const countRow = this.sql
      .exec(`SELECT COUNT(*) AS total FROM staff_audit_log`)
      .one() as Record<string, unknown> | undefined
    const total = (countRow?.['total'] as number) ?? 0

    const rows = [
      ...this.sql.exec(
        `SELECT l.id, l.staff_member_id, sm.name AS staff_member_name,
                l.performed_by, l.action, l.metadata, l.created_at
         FROM staff_audit_log l
         LEFT JOIN staff_member sm ON sm.id = l.staff_member_id
         ORDER BY l.created_at DESC
         LIMIT ? OFFSET ?`,
        limit,
        offset,
      ),
    ] as Array<Record<string, unknown>>

    // Note: performer_name requires a D1 user_profile lookup — the caller
    // (server function) enriches these with user display names from D1.
    const entries: StaffAuditEntry[] = rows.map((r) => ({
      id: r['id'] as string,
      staffMemberId: (r['staff_member_id'] as string) ?? null,
      staffMemberName: (r['staff_member_name'] as string) ?? null,
      performedByUserId: (r['performed_by'] as string) ?? null,
      performedByName: null, // enriched by caller from D1
      action: r['action'] as StaffAuditAction,
      metadata: r['metadata']
        ? (JSON.parse(r['metadata'] as string) as Record<string, string>)
        : null,
      createdAt: r['created_at'] as string,
    }))

    return { entries, total }
  }
}
