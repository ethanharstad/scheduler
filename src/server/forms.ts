import { createServerFn } from '@tanstack/react-start'
import { requireOrgMembership } from '@/server/_helpers'
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoNow(): string {
  return new Date().toISOString()
}

function computeNextDueForSchedule(base: string, rule: { freq: string; dayOfWeek?: number; dayOfMonth?: number }): string {
  const baseDate = new Date(base + 'T00:00:00Z')

  if (rule.freq === 'daily') {
    return new Date(baseDate.getTime() + 86400000).toISOString().slice(0, 10)
  }

  if (rule.freq === 'weekly') {
    const dow = rule.dayOfWeek ?? 5
    let diff = (dow - baseDate.getUTCDay() + 7) % 7
    if (diff === 0) diff = 7
    return new Date(baseDate.getTime() + diff * 86400000).toISOString().slice(0, 10)
  }

  const dom = Math.min(rule.dayOfMonth ?? baseDate.getUTCDate(), 28)
  const monthStep =
    rule.freq === 'monthly' ? 1 : rule.freq === 'quarterly' ? 3 : rule.freq === 'semi_annual' ? 6 : 12

  let year = baseDate.getUTCFullYear()
  let month = baseDate.getUTCMonth() + monthStep
  year += Math.floor(month / 12)
  month = ((month % 12) + 12) % 12
  return new Date(Date.UTC(year, month, dom)).toISOString().slice(0, 10)
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

    const conditions: string[] = []
    const binds: (string | number)[] = []

    if (data.includeSystem) {
      conditions.push('(ft.org_id = ? OR ft.is_system = 1)')
      binds.push(membership.orgId)
    } else {
      conditions.push('ft.org_id = ?')
      binds.push(membership.orgId)
    }

    if (data.category) {
      conditions.push('ft.category = ?')
      binds.push(data.category)
    }

    if (data.status) {
      conditions.push('ft.status = ?')
      binds.push(data.status)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    type Row = TemplateRow & { max_version: number; created_by_name: string | null }
    const { results } = await env.DB.prepare(
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
       ${whereClause}
       ORDER BY ft.updated_at DESC`,
    )
      .bind(...binds)
      .all<Row>()

    const templates: FormTemplateView[] = results.map((r) =>
      toTemplateView(r, r.max_version, r.created_by_name),
    )

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
    const templateRow = await env.DB.prepare(
      `SELECT ft.*, sm.name AS created_by_name
       FROM form_template ft
       LEFT JOIN staff_member sm ON sm.id = ft.created_by
       WHERE ft.id = ? AND (ft.org_id = ? OR ft.is_system = 1)`,
    )
      .bind(data.templateId, membership.orgId)
      .first<Row>()

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }

    const versionRow = await env.DB.prepare(
      `SELECT * FROM form_template_version
       WHERE template_id = ?
       ORDER BY version_number DESC LIMIT 1`,
    )
      .bind(data.templateId)
      .first<VersionRow>()

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
    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE org_id = ? AND user_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.orgId, membership.userId)
      .first<StaffRow>()

    const now = isoNow()
    const templateId = crypto.randomUUID()
    const versionId = crypto.randomUUID()

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO form_template (id, org_id, name, description, category, is_system, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 'draft', ?, ?, ?)`,
      ).bind(templateId, membership.orgId, name, data.description ?? null, data.category, staffRow?.id ?? null, now, now),
      env.DB.prepare(
        `INSERT INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
         VALUES (?, ?, 1, ?, NULL, ?)`,
      ).bind(versionId, templateId, JSON.stringify(data.fields ?? []), now),
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

    const templateRow = await env.DB.prepare(
      `SELECT * FROM form_template WHERE id = ? AND org_id = ?`,
    )
      .bind(data.templateId, membership.orgId)
      .first<TemplateRow>()

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }
    if (templateRow.status === 'archived') return { success: false, error: 'ARCHIVED' }

    const now = isoNow()
    const stmts: D1PreparedStatement[] = []

    // Update template metadata
    const newName = data.name?.trim() ?? templateRow.name
    const newDesc = data.description !== undefined ? data.description : templateRow.description

    stmts.push(
      env.DB.prepare(
        `UPDATE form_template SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
      ).bind(newName, newDesc ?? null, now, data.templateId),
    )

    // If fields changed, create a new version
    let newVersionNumber = 0
    if (data.fields) {
      type MaxVer = { max_ver: number | null }
      const maxVer = await env.DB.prepare(
        `SELECT MAX(version_number) AS max_ver FROM form_template_version WHERE template_id = ?`,
      )
        .bind(data.templateId)
        .first<MaxVer>()
      newVersionNumber = (maxVer?.max_ver ?? 0) + 1
      const versionId = crypto.randomUUID()
      stmts.push(
        env.DB.prepare(
          `INSERT INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
           VALUES (?, ?, ?, ?, NULL, ?)`,
        ).bind(versionId, data.templateId, newVersionNumber, JSON.stringify(data.fields), now),
      )
    }

    await env.DB.batch(stmts)

    // Re-fetch for accurate view
    type Row = TemplateRow & { max_version: number; created_by_name: string | null }
    const updated = await env.DB.prepare(
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
    )
      .bind(data.templateId)
      .first<Row>()

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

    const templateRow = await env.DB.prepare(
      `SELECT * FROM form_template WHERE id = ? AND org_id = ?`,
    )
      .bind(data.templateId, membership.orgId)
      .first<TemplateRow>()

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }
    if (templateRow.status === 'published') return { success: false, error: 'ALREADY_PUBLISHED' }

    // Get latest version and check it has fields
    const latestVersion = await env.DB.prepare(
      `SELECT * FROM form_template_version WHERE template_id = ? ORDER BY version_number DESC LIMIT 1`,
    )
      .bind(data.templateId)
      .first<VersionRow>()

    if (!latestVersion) return { success: false, error: 'NO_FIELDS' }
    const fields = JSON.parse(latestVersion.fields_json) as FormFieldDefinition[]
    if (!hasDataFields(fields)) return { success: false, error: 'NO_FIELDS' }

    const now = isoNow()
    await env.DB.batch([
      env.DB.prepare(`UPDATE form_template SET status = 'published', updated_at = ? WHERE id = ?`).bind(now, data.templateId),
      env.DB.prepare(`UPDATE form_template_version SET published_at = ? WHERE id = ?`).bind(now, latestVersion.id),
    ])

    type Row = TemplateRow & { created_by_name: string | null }
    const updated = await env.DB.prepare(
      `SELECT ft.*, sm.name AS created_by_name FROM form_template ft
       LEFT JOIN staff_member sm ON sm.id = ft.created_by WHERE ft.id = ?`,
    )
      .bind(data.templateId)
      .first<Row>()
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

    const templateRow = await env.DB.prepare(
      `SELECT id FROM form_template WHERE id = ? AND org_id = ?`,
    )
      .bind(data.templateId, membership.orgId)
      .first<{ id: string }>()

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }

    const now = isoNow()
    await env.DB.prepare(
      `UPDATE form_template SET status = 'archived', updated_at = ? WHERE id = ?`,
    ).bind(now, data.templateId).run()

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

    // Find staff member
    type StaffRow = { id: string }
    const staffRow = await env.DB.prepare(
      `SELECT id FROM staff_member WHERE org_id = ? AND user_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.orgId, membership.userId)
      .first<StaffRow>()

    const now = isoNow()
    const newId = crypto.randomUUID()
    const newVersionId = crypto.randomUUID()
    const cloneName = data.name?.trim() || systemTemplate.name

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO form_template (id, org_id, name, description, category, is_system, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 'draft', ?, ?, ?)`,
      ).bind(newId, membership.orgId, cloneName, systemTemplate.description, systemTemplate.category, staffRow?.id ?? null, now, now),
      env.DB.prepare(
        `INSERT INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
         VALUES (?, ?, 1, ?, NULL, ?)`,
      ).bind(newVersionId, newId, sysVersion?.fields_json ?? '[]', now),
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

    // Fetch the template
    const templateRow = await env.DB.prepare(
      `SELECT * FROM form_template WHERE id = ? AND (org_id = ? OR is_system = 1)`,
    )
      .bind(data.templateId, membership.orgId)
      .first<TemplateRow>()

    if (!templateRow) return { success: false, error: 'NOT_FOUND' }
    if (templateRow.status !== 'published') return { success: false, error: 'NOT_PUBLISHED' }

    // Get the latest published version
    const versionRow = await env.DB.prepare(
      `SELECT * FROM form_template_version
       WHERE template_id = ? AND published_at IS NOT NULL
       ORDER BY version_number DESC LIMIT 1`,
    )
      .bind(data.templateId)
      .first<VersionRow>()

    if (!versionRow) return { success: false, error: 'NOT_PUBLISHED' }

    const fields = JSON.parse(versionRow.fields_json) as FormFieldDefinition[]

    // Validate required fields
    const validationErrors: Record<string, string> = {}
    validateFields(fields, data.values, '', validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      return { success: false, error: 'VALIDATION_ERROR', validationErrors }
    }

    // Find the submitter's staff record
    type StaffRow = { id: string; name: string }
    const staffRow = await env.DB.prepare(
      `SELECT id, name FROM staff_member WHERE org_id = ? AND user_id = ? AND status != 'removed' LIMIT 1`,
    )
      .bind(membership.orgId, membership.userId)
      .first<StaffRow>()

    if (!staffRow) return { success: false, error: 'UNAUTHORIZED' }

    const now = isoNow()
    const submissionId = crypto.randomUUID()

    const stmts: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO form_submission (id, org_id, template_id, template_version_id, submitted_by, status, linked_entity_type, linked_entity_id, schedule_id, submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?)`,
      ).bind(
        submissionId,
        membership.orgId,
        data.templateId,
        versionRow.id,
        staffRow.id,
        data.linkedEntityType ?? null,
        data.linkedEntityId ?? null,
        data.scheduleId ?? null,
        now,
        now,
        now,
      ),
    ]

    // Insert response values
    const valueStmts = buildValueInserts(env, submissionId, fields, data.values, '')
    stmts.push(...valueStmts)

    await env.DB.batch(stmts)

    // If linked to an inspection schedule, advance next_inspection_due
    if (data.scheduleId) {
      type SchedRow = { recurrence_rule: string }
      const schedRow = await env.DB.prepare(
        `SELECT recurrence_rule FROM asset_inspection_schedule WHERE id = ? AND org_id = ?`,
      ).bind(data.scheduleId, membership.orgId).first<SchedRow>()

      if (schedRow) {
        const rule = JSON.parse(schedRow.recurrence_rule) as { freq: string; dayOfWeek?: number; dayOfMonth?: number }
        const baseDate = now.slice(0, 10) // submission date
        const nextDue = computeNextDueForSchedule(baseDate, rule)
        await env.DB.prepare(
          `UPDATE asset_inspection_schedule SET next_inspection_due = ?, updated_at = ? WHERE id = ?`,
        ).bind(nextDue, now, data.scheduleId).run()
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

function buildValueInserts(
  env: Cloudflare.Env,
  submissionId: string,
  fields: FormFieldDefinition[],
  values: Record<string, string | number | boolean | string[] | null>,
  prefix: string,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = []

  for (const field of fields) {
    if (field.type === 'section_header' || field.type === 'divider') continue

    if (field.type === 'repeating_group' && 'children' in field && field.children) {
      // Find max index for this group
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
        stmts.push(...buildValueInserts(env, submissionId, field.children, values, entryPrefix))
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

    stmts.push(
      env.DB.prepare(
        `INSERT INTO form_response_value (id, submission_id, field_key, field_type, value_text, value_number, value_boolean)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), submissionId, key, field.type, valueText, valueNumber, valueBoolean),
    )
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

    const conditions: string[] = ['fs.org_id = ?']
    const binds: (string | number)[] = [membership.orgId]

    // If user can only submit (not manage), only show their own
    if (!canManage) {
      type StaffRow = { id: string }
      const staffRow = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE org_id = ? AND user_id = ? AND status != 'removed' LIMIT 1`,
      )
        .bind(membership.orgId, membership.userId)
        .first<StaffRow>()
      if (!staffRow) return { success: true, submissions: [], total: 0 }
      conditions.push('fs.submitted_by = ?')
      binds.push(staffRow.id)
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

    const whereClause = `WHERE ${conditions.join(' AND ')}`
    const limit = Math.min(data.limit ?? 50, 100)
    const offset = data.offset ?? 0

    type CountRow = { cnt: number }
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM form_submission fs ${whereClause}`,
    )
      .bind(...binds)
      .first<CountRow>()

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

    const { results } = await env.DB.prepare(
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
    )
      .bind(...binds, limit, offset)
      .all<Row>()

    const submissions: FormSubmissionView[] = results.map((r) => ({
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

    return { success: true, submissions, total: countRow?.cnt ?? 0 }
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

    const row = await env.DB.prepare(
      `SELECT fs.id, fs.template_id, ft.name AS template_name,
              fs.template_version_id, ftv.version_number, ftv.fields_json,
              fs.submitted_by, sm.name AS submitted_by_name,
              fs.status, fs.linked_entity_type, fs.linked_entity_id,
              fs.submitted_at
       FROM form_submission fs
       JOIN form_template ft ON ft.id = fs.template_id
       JOIN form_template_version ftv ON ftv.id = fs.template_version_id
       JOIN staff_member sm ON sm.id = fs.submitted_by
       WHERE fs.id = ? AND fs.org_id = ?`,
    )
      .bind(data.submissionId, membership.orgId)
      .first<Row>()

    if (!row) return { success: false, error: 'NOT_FOUND' }

    // Check visibility: manage-forms sees all, otherwise only own
    if (!canDo(membership.role, 'manage-forms')) {
      type StaffRow = { id: string }
      const staffRow = await env.DB.prepare(
        `SELECT id FROM staff_member WHERE org_id = ? AND user_id = ? AND status != 'removed' LIMIT 1`,
      )
        .bind(membership.orgId, membership.userId)
        .first<StaffRow>()
      if (!staffRow || staffRow.id !== row.submitted_by) {
        return { success: false, error: 'NOT_FOUND' }
      }
    }

    // Fetch values
    type ValueRow = {
      field_key: string
      field_type: string
      value_text: string | null
      value_number: number | null
      value_boolean: number | null
    }
    const { results: valueRows } = await env.DB.prepare(
      `SELECT field_key, field_type, value_text, value_number, value_boolean
       FROM form_response_value WHERE submission_id = ?`,
    )
      .bind(data.submissionId)
      .all<ValueRow>()

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
      linkedEntityName: null,
      submittedAt: row.submitted_at,
      fields: JSON.parse(row.fields_json) as FormFieldDefinition[],
      values,
    }

    return { success: true, submission }
  })
