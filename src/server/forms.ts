import { createServerFn } from '@tanstack/react-start'
import { requireOrgMembership } from '@/server/_helpers'
import { getOrgStub } from '@/server/_do-helpers'
import { canDo } from '@/lib/rbac'
import type {
  FormTemplateView,
  FormTemplateVersionView,
  FormSubmissionView,
  FormSubmissionDetailView,
  FormResponseValueView,
  FormFieldDefinition,
  CreateFormTemplateInput,
  CreateFormTemplateOutput,
  CloneSystemTemplateInput,
  CloneSystemTemplateOutput,
  UpdateFormTemplateInput,
  UpdateFormTemplateOutput,
  PublishFormTemplateInput,
  PublishFormTemplateOutput,
  ArchiveFormTemplateInput,
  ArchiveFormTemplateOutput,
  ListFormTemplatesInput,
  ListFormTemplatesOutput,
  GetFormTemplateInput,
  GetFormTemplateOutput,
  SubmitFormInput,
  SubmitFormOutput,
  ListSubmissionsInput,
  ListSubmissionsOutput,
  GetSubmissionInput,
  GetSubmissionOutput,
  FormFieldType,
  FormCategory,
} from '@/lib/form.types'
import { computeNextDue } from '@/lib/rrule'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoNow(): string {
  return new Date().toISOString()
}

function orgToday(scheduleDayStart: string): string {
  const now = new Date()
  const [h, m] = scheduleDayStart.split(':').map(Number)
  const dayStartMs = ((h ?? 0) * 60 + (m ?? 0)) * 60 * 1000
  const utcMs = now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000
  const effectiveDate = utcMs < dayStartMs ? new Date(now.getTime() - 86400000) : now
  return effectiveDate.toISOString().slice(0, 10)
}


const VALID_CATEGORIES: FormCategory[] = [
  'equipment_inspection',
  'property_inspection',
  'medication',
  'custom',
]

type TemplateRow = {
  id: string
  org_id: string | null
  name: string
  description: string | null
  category: string
  is_system: number
  status: string
  created_by: string | null
  created_at: string
  updated_at: string
}

type VersionRow = {
  id: string
  template_id: string
  version_number: number
  fields_json: string
  published_at: string | null
  created_at: string
}

function toTemplateView(row: TemplateRow, versionNumber: number, createdByName: string | null): FormTemplateView {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    category: row.category as FormCategory,
    isSystem: row.is_system === 1,
    status: row.status as FormTemplateView['status'],
    currentVersionNumber: versionNumber,
    createdByName,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toVersionView(row: VersionRow): FormTemplateVersionView {
  return {
    id: row.id,
    templateId: row.template_id,
    versionNumber: row.version_number,
    fields: JSON.parse(row.fields_json) as FormFieldDefinition[],
    publishedAt: row.published_at,
    createdAt: row.created_at,
  }
}

function hasDataFields(fields: FormFieldDefinition[]): boolean {
  return fields.some(
    (f) => f.type !== 'section_header' && f.type !== 'divider',
  )
}

// ---------------------------------------------------------------------------
// List Form Templates
// ---------------------------------------------------------------------------

export const listFormTemplatesServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListFormTemplatesInput) => d)
  .handler(async (ctx): Promise<ListFormTemplatesOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)

    // Read org templates from DO
    const doConditions: string[] = []
    const doBinds: (string | number)[] = []
    if (data.category) {
      doConditions.push('ft.category = ?')
      doBinds.push(data.category)
    }
    if (data.status) {
      doConditions.push('ft.status = ?')
      doBinds.push(data.status)
    }
    const doWhere = doConditions.length > 0 ? `WHERE ${doConditions.join(' AND ')}` : ''
    type Row = TemplateRow & { max_version: number; created_by_name: string | null }
    const orgRows = await stub.query(
      `SELECT ft.*,
              COALESCE(v.max_ver, 0) AS max_version,
              sm.name AS created_by_name
       FROM form_template ft
       LEFT JOIN (
         SELECT template_id, MAX(version_number) AS max_ver
         FROM form_template_version
         GROUP BY template_id
       ) v ON v.template_id = ft.id
       LEFT JOIN staff_member sm ON sm.id = ft.created_by
       ${doWhere}
       ORDER BY ft.updated_at DESC`,
      ...doBinds,
    ) as Row[]

    const templates: FormTemplateView[] = orgRows.map((r) =>
      toTemplateView(r, r.max_version, r.created_by_name),
    )

    // If includeSystem, also fetch system templates from D1
    if (data.includeSystem) {
      const sysConditions: string[] = ['ft.is_system = 1']
      const sysBinds: (string | number)[] = []
      if (data.category) {
        sysConditions.push('ft.category = ?')
        sysBinds.push(data.category)
      }
      if (data.status) {
        sysConditions.push('ft.status = ?')
        sysBinds.push(data.status)
      }
      const sysWhere = `WHERE ${sysConditions.join(' AND ')}`
      const { results: sysResults } = await env.DB.prepare(
        `SELECT ft.*,
                COALESCE(v.max_ver, 0) AS max_version,
                NULL AS created_by_name
         FROM form_template ft
         LEFT JOIN (
           SELECT template_id, MAX(version_number) AS max_ver
           FROM form_template_version
           GROUP BY template_id
         ) v ON v.template_id = ft.id
         ${sysWhere}
         ORDER BY ft.updated_at DESC`,
      )
        .bind(...sysBinds)
        .all<Row>()

      templates.push(
        ...sysResults.map((r) => toTemplateView(r, r.max_version, r.created_by_name)),
      )
    }

    return { success: true, templates }
  })

// ---------------------------------------------------------------------------
// Get Form Template
// ---------------------------------------------------------------------------

export const getFormTemplateServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetFormTemplateInput) => d)
  .handler(async (ctx): Promise<GetFormTemplateOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    type Row = TemplateRow & { created_by_name: string | null }

    // Try DO first (org template)
    const stub = getOrgStub(env, membership.orgId)
    const doRows = await stub.query(
      `SELECT ft.*, sm.name AS created_by_name
       FROM form_template ft
       LEFT JOIN staff_member sm ON sm.id = ft.created_by
       WHERE ft.id = ?`,
      data.templateId,
    ) as Row[]
    let templateRow: Row | null = doRows[0] ?? null

    // If not found in DO, check D1 for system template
    if (!templateRow) {
      templateRow = await env.DB.prepare(
        `SELECT ft.*, NULL AS created_by_name
         FROM form_template ft
         WHERE ft.id = ? AND ft.is_system = 1`,
      )
        .bind(data.templateId)
        .first<Row>()
    }

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }

    // Read version from the same source as the template
    let versionRow: VersionRow | null = null
    const versionSuffix = data.publishedOnly ? ' AND published_at IS NOT NULL' : ''

    if (templateRow.is_system === 1 && templateRow.org_id === null) {
      // System template — version lives in D1
      versionRow = await env.DB.prepare(
        `SELECT * FROM form_template_version
         WHERE template_id = ?${versionSuffix}
         ORDER BY version_number DESC LIMIT 1`,
      )
        .bind(data.templateId)
        .first<VersionRow>()
    } else {
      // Org template — version lives in DO
      const vRows = await stub.query(
        `SELECT * FROM form_template_version
         WHERE template_id = ?${versionSuffix}
         ORDER BY version_number DESC LIMIT 1`,
        data.templateId,
      ) as VersionRow[]
      versionRow = vRows[0] ?? null
    }

    const versionNumber = versionRow?.version_number ?? 0
    const template = toTemplateView(templateRow, versionNumber, templateRow.created_by_name)
    const currentVersion = versionRow ? toVersionView(versionRow) : {
      id: '',
      templateId: data.templateId,
      versionNumber: 0,
      fields: [],
      publishedAt: null,
      createdAt: templateRow.created_at,
    }

    return { success: true, template, currentVersion }
  })

// ---------------------------------------------------------------------------
// Create Form Template
// ---------------------------------------------------------------------------

export const createFormTemplateServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CreateFormTemplateInput) => d)
  .handler(async (ctx): Promise<CreateFormTemplateOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-forms')) return { success: false, error: 'FORBIDDEN' }

    const name = data.name?.trim()
    if (!name || name.length < 1 || name.length > 200) return { success: false, error: 'INVALID_INPUT' }
    if (!VALID_CATEGORIES.includes(data.category)) return { success: false, error: 'INVALID_INPUT' }

    // Find the staff_member for created_by
    const stub = getOrgStub(env, membership.orgId)
    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    const now = isoNow()
    const templateId = crypto.randomUUID()
    const versionId = crypto.randomUUID()

    await stub.executeBatch([
      {
        sql: `INSERT INTO form_template (id, name, description, category, is_system, status, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, 0, 'draft', ?, ?, ?)`,
        params: [templateId, name, data.description ?? null, data.category, staffRow?.id ?? null, now, now],
      },
      {
        sql: `INSERT INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
              VALUES (?, ?, 1, ?, NULL, ?)`,
        params: [versionId, templateId, JSON.stringify(data.fields ?? []), now],
      },
    ])

    const template: FormTemplateView = {
      id: templateId,
      orgId: membership.orgId,
      name,
      description: data.description ?? null,
      category: data.category,
      isSystem: false,
      status: 'draft',
      currentVersionNumber: 1,
      createdByName: null,
      createdAt: now,
      updatedAt: now,
    }

    return { success: true, template }
  })

// ---------------------------------------------------------------------------
// Update Form Template
// ---------------------------------------------------------------------------

export const updateFormTemplateServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateFormTemplateInput) => d)
  .handler(async (ctx): Promise<UpdateFormTemplateOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-forms')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    const templateRows = await stub.query(
      `SELECT * FROM form_template WHERE id = ?`,
      data.templateId,
    ) as TemplateRow[]
    const templateRow = templateRows[0] ?? null

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }
    if (templateRow.status === 'archived') return { success: false, error: 'ARCHIVED' }

    const now = isoNow()
    const doStmts: Array<{ sql: string; params: unknown[] }> = []

    // Update template metadata
    const newName = data.name?.trim() ?? templateRow.name
    const newDesc = data.description !== undefined ? data.description : templateRow.description

    doStmts.push({
      sql: `UPDATE form_template SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
      params: [newName, newDesc ?? null, now, data.templateId],
    })

    // If fields changed, create a new version
    let newVersionNumber = 0
    if (data.fields) {
      type MaxVer = { max_ver: number | null }
      const maxVerRows = await stub.query(
        `SELECT MAX(version_number) AS max_ver FROM form_template_version WHERE template_id = ?`,
        data.templateId,
      ) as MaxVer[]
      newVersionNumber = (maxVerRows[0]?.max_ver ?? 0) + 1
      const versionId = crypto.randomUUID()
      doStmts.push({
        sql: `INSERT INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
              VALUES (?, ?, ?, ?, NULL, ?)`,
        params: [versionId, data.templateId, newVersionNumber, JSON.stringify(data.fields), now],
      })
    }

    await stub.executeBatch(doStmts)

    // Re-fetch for accurate view
    type Row = TemplateRow & { max_version: number; created_by_name: string | null }
    const updatedRows = await stub.query(
      `SELECT ft.*,
              COALESCE(v.max_ver, 0) AS max_version,
              sm.name AS created_by_name
       FROM form_template ft
       LEFT JOIN (
         SELECT template_id, MAX(version_number) AS max_ver
         FROM form_template_version
         GROUP BY template_id
       ) v ON v.template_id = ft.id
       LEFT JOIN staff_member sm ON sm.id = ft.created_by
       WHERE ft.id = ?`,
      data.templateId,
    ) as Row[]
    const updated = updatedRows[0] ?? null

    if (!updated) return { success: false, error: 'NOT_FOUND' }

    return {
      success: true,
      template: toTemplateView(updated, updated.max_version, updated.created_by_name),
    }
  })

// ---------------------------------------------------------------------------
// Publish Form Template
// ---------------------------------------------------------------------------

export const publishFormTemplateServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: PublishFormTemplateInput) => d)
  .handler(async (ctx): Promise<PublishFormTemplateOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-forms')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    const templateRows = await stub.query(
      `SELECT * FROM form_template WHERE id = ?`,
      data.templateId,
    ) as TemplateRow[]
    const templateRow = templateRows[0] ?? null

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }
    if (templateRow.status === 'published') return { success: false, error: 'ALREADY_PUBLISHED' }

    // Get latest version and check it has fields
    const versionRows = await stub.query(
      `SELECT * FROM form_template_version WHERE template_id = ? ORDER BY version_number DESC LIMIT 1`,
      data.templateId,
    ) as VersionRow[]
    const latestVersion = versionRows[0] ?? null

    if (!latestVersion) return { success: false, error: 'NO_FIELDS' }
    const fields = JSON.parse(latestVersion.fields_json) as FormFieldDefinition[]
    if (!hasDataFields(fields)) return { success: false, error: 'NO_FIELDS' }

    const now = isoNow()
    await stub.executeBatch([
      {
        sql: `UPDATE form_template SET status = 'published', updated_at = ? WHERE id = ?`,
        params: [now, data.templateId],
      },
      {
        sql: `UPDATE form_template_version SET published_at = ? WHERE id = ?`,
        params: [now, latestVersion.id],
      },
    ])

    // Re-fetch for accurate view
    type Row = TemplateRow & { created_by_name: string | null }
    const updatedRows = await stub.query(
      `SELECT ft.*, sm.name AS created_by_name FROM form_template ft
       LEFT JOIN staff_member sm ON sm.id = ft.created_by WHERE ft.id = ?`,
      data.templateId,
    ) as Row[]
    const updated = updatedRows[0] ?? null
    if (!updated) return { success: false, error: 'NOT_FOUND' }

    return { success: true, template: toTemplateView(updated, latestVersion.version_number, updated.created_by_name) }
  })

// ---------------------------------------------------------------------------
// Archive Form Template
// ---------------------------------------------------------------------------

export const archiveFormTemplateServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ArchiveFormTemplateInput) => d)
  .handler(async (ctx): Promise<ArchiveFormTemplateOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-forms')) return { success: false, error: 'FORBIDDEN' }

    const stub = getOrgStub(env, membership.orgId)
    const templateRows = await stub.query(
      `SELECT id FROM form_template WHERE id = ?`,
      data.templateId,
    ) as Array<{ id: string }>
    const templateRow = templateRows[0] ?? null

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }

    const now = isoNow()
    await stub.execute(
      `UPDATE form_template SET status = 'archived', updated_at = ? WHERE id = ?`,
      now, data.templateId,
    )

    return { success: true }
  })

// ---------------------------------------------------------------------------
// Clone System Template
// ---------------------------------------------------------------------------

export const cloneSystemTemplateServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: CloneSystemTemplateInput) => d)
  .handler(async (ctx): Promise<CloneSystemTemplateOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'manage-forms')) return { success: false, error: 'FORBIDDEN' }

    const systemTemplate = await env.DB.prepare(
      `SELECT * FROM form_template WHERE id = ? AND is_system = 1`,
    )
      .bind(data.systemTemplateId)
      .first<TemplateRow>()

    if (!systemTemplate) return { success: false, error: 'NOT_FOUND' }
    if (systemTemplate.is_system !== 1) return { success: false, error: 'NOT_SYSTEM_TEMPLATE' }

    // Get latest version of system template
    const sysVersion = await env.DB.prepare(
      `SELECT * FROM form_template_version WHERE template_id = ? ORDER BY version_number DESC LIMIT 1`,
    )
      .bind(data.systemTemplateId)
      .first<VersionRow>()

    // Find staff member from DO
    const stub = getOrgStub(env, membership.orgId)
    type StaffRow = { id: string }
    const staffRows = await stub.query(
      `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
      membership.userId,
    ) as StaffRow[]
    const staffRow = staffRows[0] ?? null

    const now = isoNow()
    const newId = crypto.randomUUID()
    const newVersionId = crypto.randomUUID()
    const cloneName = data.name?.trim() || systemTemplate.name

    // Write clone to DO only
    await stub.executeBatch([
      {
        sql: `INSERT INTO form_template (id, name, description, category, is_system, status, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, 0, 'draft', ?, ?, ?)`,
        params: [newId, cloneName, systemTemplate.description, systemTemplate.category, staffRow?.id ?? null, now, now],
      },
      {
        sql: `INSERT INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
              VALUES (?, ?, 1, ?, NULL, ?)`,
        params: [newVersionId, newId, sysVersion?.fields_json ?? '[]', now],
      },
    ])

    const template: FormTemplateView = {
      id: newId,
      orgId: membership.orgId,
      name: cloneName,
      description: systemTemplate.description,
      category: systemTemplate.category as FormCategory,
      isSystem: false,
      status: 'draft',
      currentVersionNumber: 1,
      createdByName: null,
      createdAt: now,
      updatedAt: now,
    }

    return { success: true, template }
  })

// ---------------------------------------------------------------------------
// Submit Form
// ---------------------------------------------------------------------------

export const submitFormServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: SubmitFormInput) => d)
  .handler(async (ctx): Promise<SubmitFormOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }
    if (!canDo(membership.role, 'submit-forms')) return { success: false, error: 'FORBIDDEN' }

    try {
      const stub = getOrgStub(env, membership.orgId)

      // Fetch the template — try DO first (org template), then D1 (system template)
      const doTemplateRows = await stub.query(
        `SELECT * FROM form_template WHERE id = ?`,
        data.templateId,
      ) as TemplateRow[]
      let templateRow: TemplateRow | null = doTemplateRows[0] ?? null
      let isSystemTemplate = false

      if (!templateRow) {
        // Check D1 for system template
        templateRow = await env.DB.prepare(
          `SELECT * FROM form_template WHERE id = ? AND is_system = 1`,
        )
          .bind(data.templateId)
          .first<TemplateRow>()
        if (templateRow) isSystemTemplate = true
      }

      if (!templateRow) return { success: false, error: 'NOT_FOUND' }
      if (templateRow.status !== 'published') return { success: false, error: 'NOT_PUBLISHED' }

      // Get the latest published version from the same source
      let versionRow: VersionRow | null = null
      if (isSystemTemplate) {
        versionRow = await env.DB.prepare(
          `SELECT * FROM form_template_version
           WHERE template_id = ? AND published_at IS NOT NULL
           ORDER BY version_number DESC LIMIT 1`,
        )
          .bind(data.templateId)
          .first<VersionRow>()
      } else {
        const vRows = await stub.query(
          `SELECT * FROM form_template_version
           WHERE template_id = ? AND published_at IS NOT NULL
           ORDER BY version_number DESC LIMIT 1`,
          data.templateId,
        ) as VersionRow[]
        versionRow = vRows[0] ?? null
      }

      if (!versionRow) return { success: false, error: 'NOT_PUBLISHED' }

      const fields = JSON.parse(versionRow.fields_json) as FormFieldDefinition[]

      // Validate required fields
      const validationErrors: Record<string, string> = {}
      validateFields(fields, data.values, '', validationErrors)
      if (Object.keys(validationErrors).length > 0) {
        return { success: false, error: 'VALIDATION_ERROR', validationErrors }
      }

      // Find the submitter's staff record from DO
      type StaffRow = { id: string; name: string }
      const staffRows = await stub.query(
        `SELECT id, name FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
        membership.userId,
      ) as StaffRow[]
      const staffRow = staffRows[0] ?? null

      if (!staffRow) return { success: false, error: 'UNAUTHORIZED' }

      const now = isoNow()
      const submissionId = crypto.randomUUID()

      // Write submission + response values to DO only
      const doStmts: Array<{ sql: string; params: unknown[] }> = [
        {
          sql: `INSERT INTO form_submission (id, template_id, template_version_id, submitted_by, status, linked_entity_type, linked_entity_id, schedule_id, submitted_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?)`,
          params: [
            submissionId,
            data.templateId,
            versionRow.id,
            staffRow.id,
            data.linkedEntityType ?? null,
            data.linkedEntityId ?? null,
            data.scheduleId ?? null,
            now,
            now,
            now,
          ],
        },
      ]
      const doValueStmts = buildDOValueInserts(submissionId, fields, data.values, '')
      doStmts.push(...doValueStmts)
      await stub.executeBatch(doStmts)

      // If linked to an inspection schedule, advance next_inspection_due
      if (data.scheduleId) {
        type SchedRow = { recurrence_rule: string }
        const schedRows = await stub.query(
          `SELECT recurrence_rule FROM asset_inspection_schedule WHERE id = ?`,
          data.scheduleId,
        ) as SchedRow[]
        const schedRow = schedRows[0] ?? null

        if (schedRow) {
          const settingsStub = getOrgStub(env, membership.orgId)
          const settingsRows = await settingsStub.query(
            `SELECT schedule_day_start FROM org_settings WHERE id = 'settings'`,
          ) as { schedule_day_start: string }[]
          const baseDate = orgToday(settingsRows[0]?.schedule_day_start ?? '00:00')
          const nextDue = computeNextDue(baseDate, schedRow.recurrence_rule, true)
          await stub.execute(
            `UPDATE asset_inspection_schedule SET next_inspection_due = ?, updated_at = ? WHERE id = ?`,
            nextDue, now, data.scheduleId,
          )
        }
      }

      const submission: FormSubmissionView = {
        id: submissionId,
        templateId: data.templateId,
        templateName: templateRow.name,
        templateVersionId: versionRow.id,
        versionNumber: versionRow.version_number,
        submittedById: staffRow.id,
        submittedByName: staffRow.name,
        status: 'complete',
        linkedEntityType: (data.linkedEntityType as FormSubmissionView['linkedEntityType']) ?? null,
        linkedEntityId: data.linkedEntityId ?? null,
        linkedEntityName: null,
        submittedAt: now,
      }

      return { success: true, submission }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: 'SERVER_ERROR', message }
    }
  })

function validateFields(
  fields: FormFieldDefinition[],
  values: Record<string, string | number | boolean | string[] | null>,
  prefix: string,
  errors: Record<string, string>,
): void {
  for (const field of fields) {
    if (field.type === 'section_header' || field.type === 'divider') continue

    if (field.type === 'repeating_group') {
      // Check entries exist if required
      let entryCount = 0
      while (values[`${prefix}${field.key}[${entryCount}].${field.children?.[0]?.key ?? '_'}`] !== undefined) {
        entryCount++
      }
      // Also count by checking all keys matching the pattern
      const groupPrefix = `${prefix}${field.key}[`
      const maxIdx = Object.keys(values)
        .filter((k) => k.startsWith(groupPrefix))
        .map((k) => {
          const match = k.match(/\[(\d+)\]/)
          return match ? parseInt(match[1], 10) : -1
        })
        .reduce((max, n) => Math.max(max, n), -1)
      entryCount = maxIdx + 1

      if (field.minEntries && entryCount < field.minEntries) {
        errors[`${prefix}${field.key}`] = `At least ${field.minEntries} entries required`
      }
      if (field.maxEntries && entryCount > field.maxEntries) {
        errors[`${prefix}${field.key}`] = `At most ${field.maxEntries} entries allowed`
      }

      // Validate each entry's children
      if ('children' in field && field.children) {
        for (let i = 0; i <= maxIdx; i++) {
          validateFields(field.children, values, `${prefix}${field.key}[${i}].`, errors)
        }
      }
      continue
    }

    const key = `${prefix}${field.key}`
    const val = values[key]

    if (field.required && (val === undefined || val === null || val === '')) {
      errors[key] = `${field.label} is required`
    }
  }
}

function buildDOValueInserts(
  submissionId: string,
  fields: FormFieldDefinition[],
  values: Record<string, string | number | boolean | string[] | null>,
  prefix: string,
): Array<{ sql: string; params: unknown[] }> {
  const stmts: Array<{ sql: string; params: unknown[] }> = []

  for (const field of fields) {
    if (field.type === 'section_header' || field.type === 'divider') continue

    if (field.type === 'repeating_group' && 'children' in field && field.children) {
      const groupPrefix = `${prefix}${field.key}[`
      const maxIdx = Object.keys(values)
        .filter((k) => k.startsWith(groupPrefix))
        .map((k) => {
          const match = k.match(/\[(\d+)\]/)
          return match ? parseInt(match[1], 10) : -1
        })
        .reduce((max, n) => Math.max(max, n), -1)

      for (let i = 0; i <= maxIdx; i++) {
        const entryPrefix = `${prefix}${field.key}[${i}].`
        stmts.push(...buildDOValueInserts(submissionId, field.children, values, entryPrefix))
      }
      continue
    }

    const key = `${prefix}${field.key}`
    const val = values[key]
    if (val === undefined) continue

    let valueText: string | null = null
    let valueNumber: number | null = null
    let valueBoolean: number | null = null

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'select':
      case 'date':
      case 'time':
      case 'signature':
      case 'photo':
        valueText = val != null ? String(val) : null
        break
      case 'multi_select':
        valueText = Array.isArray(val) ? JSON.stringify(val) : (val != null ? String(val) : null)
        break
      case 'number':
        valueNumber = typeof val === 'number' ? val : (val != null ? Number(val) : null)
        break
      case 'boolean':
        valueBoolean = val === true || val === 1 || val === 'true' ? 1 : 0
        break
    }

    stmts.push({
      sql: `INSERT INTO form_response_value (id, submission_id, field_key, field_type, value_text, value_number, value_boolean)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), submissionId, key, field.type, valueText, valueNumber, valueBoolean],
    })
  }

  return stmts
}

// ---------------------------------------------------------------------------
// List Submissions
// ---------------------------------------------------------------------------

export const listSubmissionsServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: ListSubmissionsInput) => d)
  .handler(async (ctx): Promise<ListSubmissionsOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const canManage = canDo(membership.role, 'manage-forms')
    const stub = getOrgStub(env, membership.orgId)

    // Resolve staff member for non-managers
    let staffIdForFilter: string | null = null
    if (!canManage) {
      type StaffRow = { id: string }
      const staffRows = await stub.query(
        `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
        membership.userId,
      ) as StaffRow[]
      if (!staffRows[0]) return { success: true, submissions: [], total: 0 }
      staffIdForFilter = staffRows[0].id
    }

    const conditions: string[] = []
    const binds: (string | number)[] = []

    if (staffIdForFilter) {
      conditions.push('fs.submitted_by = ?')
      binds.push(staffIdForFilter)
    }
    if (data.templateId) {
      conditions.push('fs.template_id = ?')
      binds.push(data.templateId)
    }
    if (data.linkedEntityType) {
      conditions.push('fs.linked_entity_type = ?')
      binds.push(data.linkedEntityType)
    }
    if (data.linkedEntityId) {
      conditions.push('fs.linked_entity_id = ?')
      binds.push(data.linkedEntityId)
    }
    if (data.submittedBy) {
      conditions.push('fs.submitted_by = ?')
      binds.push(data.submittedBy)
    }
    if (data.startDate) {
      conditions.push('fs.submitted_at >= ?')
      binds.push(data.startDate)
    }
    if (data.endDate) {
      conditions.push('fs.submitted_at <= ?')
      binds.push(data.endDate + 'T23:59:59.999Z')
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = Math.min(data.limit ?? 50, 100)
    const offset = data.offset ?? 0

    type CountRow = { cnt: number }
    const countRows = await stub.query(
      `SELECT COUNT(*) AS cnt FROM form_submission fs ${whereClause}`,
      ...binds,
    ) as CountRow[]
    const total = countRows[0]?.cnt ?? 0

    type Row = {
      id: string
      template_id: string
      template_name: string
      template_version_id: string
      version_number: number
      submitted_by: string
      submitted_by_name: string
      status: string
      linked_entity_type: string | null
      linked_entity_id: string | null
      submitted_at: string
    }

    const rows = await stub.query(
      `SELECT fs.id, fs.template_id, ft.name AS template_name,
              fs.template_version_id, ftv.version_number,
              fs.submitted_by, sm.name AS submitted_by_name,
              fs.status, fs.linked_entity_type, fs.linked_entity_id,
              fs.submitted_at
       FROM form_submission fs
       JOIN form_template ft ON ft.id = fs.template_id
       JOIN form_template_version ftv ON ftv.id = fs.template_version_id
       JOIN staff_member sm ON sm.id = fs.submitted_by
       ${whereClause}
       ORDER BY fs.submitted_at DESC
       LIMIT ? OFFSET ?`,
      ...binds, limit, offset,
    ) as Row[]

    const submissions: FormSubmissionView[] = rows.map((r) => ({
      id: r.id,
      templateId: r.template_id,
      templateName: r.template_name,
      templateVersionId: r.template_version_id,
      versionNumber: r.version_number,
      submittedById: r.submitted_by,
      submittedByName: r.submitted_by_name,
      status: r.status as 'in_progress' | 'complete',
      linkedEntityType: r.linked_entity_type as FormSubmissionView['linkedEntityType'],
      linkedEntityId: r.linked_entity_id,
      linkedEntityName: null,
      submittedAt: r.submitted_at,
    }))

    return { success: true, submissions, total }
  })

// ---------------------------------------------------------------------------
// Get Submission
// ---------------------------------------------------------------------------

export const getSubmissionServerFn = createServerFn({ method: 'GET' })
  .inputValidator((d: GetSubmissionInput) => d)
  .handler(async (ctx): Promise<GetSubmissionOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    const stub = getOrgStub(env, membership.orgId)

    type Row = {
      id: string
      template_id: string
      template_name: string
      template_version_id: string
      version_number: number
      fields_json: string
      submitted_by: string
      submitted_by_name: string
      status: string
      linked_entity_type: string | null
      linked_entity_id: string | null
      submitted_at: string
    }

    type ValueRow = {
      field_key: string
      field_type: string
      value_text: string | null
      value_number: number | null
      value_boolean: number | null
    }

    const rows = await stub.query(
      `SELECT fs.id, fs.template_id, ft.name AS template_name,
              fs.template_version_id, ftv.version_number, ftv.fields_json,
              fs.submitted_by, sm.name AS submitted_by_name,
              fs.status, fs.linked_entity_type, fs.linked_entity_id,
              fs.submitted_at
       FROM form_submission fs
       JOIN form_template ft ON ft.id = fs.template_id
       JOIN form_template_version ftv ON ftv.id = fs.template_version_id
       JOIN staff_member sm ON sm.id = fs.submitted_by
       WHERE fs.id = ?`,
      data.submissionId,
    ) as Row[]

    const row = rows[0]
    if (!row) return { success: false, error: 'NOT_FOUND' }

    // Check visibility: manage-forms sees all, otherwise only own
    if (!canDo(membership.role, 'manage-forms')) {
      type StaffRow = { id: string }
      const staffRows = await stub.query(
        `SELECT id FROM staff_member WHERE user_id = ? AND status != 'removed' LIMIT 1`,
        membership.userId,
      ) as StaffRow[]
      const staffRow = staffRows[0] ?? null
      if (!staffRow || staffRow.id !== row.submitted_by) {
        return { success: false, error: 'NOT_FOUND' }
      }
    }

    // Fetch linked entity name from DO
    let linkedEntityName: string | null = null
    if (row.linked_entity_id) {
      if (row.linked_entity_type === 'asset') {
        const nameRows = await stub.query(
          `SELECT name FROM asset WHERE id = ?`,
          row.linked_entity_id,
        ) as Array<{ name: string }>
        linkedEntityName = nameRows[0]?.name ?? null
      } else if (row.linked_entity_type === 'staff_member') {
        const nameRows = await stub.query(
          `SELECT name FROM staff_member WHERE id = ?`,
          row.linked_entity_id,
        ) as Array<{ name: string }>
        linkedEntityName = nameRows[0]?.name ?? null
      }
    }

    // Fetch response values from DO
    const valueRows = await stub.query(
      `SELECT field_key, field_type, value_text, value_number, value_boolean
       FROM form_response_value WHERE submission_id = ?`,
      data.submissionId,
    ) as ValueRow[]

    const values: FormResponseValueView[] = valueRows.map((v) => ({
      fieldKey: v.field_key,
      fieldType: v.field_type as FormFieldType,
      valueText: v.value_text,
      valueNumber: v.value_number,
      valueBoolean: v.value_boolean != null ? v.value_boolean === 1 : null,
    }))

    const submission: FormSubmissionDetailView = {
      id: row.id,
      templateId: row.template_id,
      templateName: row.template_name,
      templateVersionId: row.template_version_id,
      versionNumber: row.version_number,
      submittedById: row.submitted_by,
      submittedByName: row.submitted_by_name,
      status: row.status as 'in_progress' | 'complete',
      linkedEntityType: row.linked_entity_type as FormSubmissionDetailView['linkedEntityType'],
      linkedEntityId: row.linked_entity_id,
      linkedEntityName,
      submittedAt: row.submitted_at,
      fields: JSON.parse(row.fields_json) as FormFieldDefinition[],
      values,
    }

    return { success: true, submission }
  })
