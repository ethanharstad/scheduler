import { createFileRoute, useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import {
  getFormTemplateServerFn,
  updateFormTemplateServerFn,
  publishFormTemplateServerFn,
  archiveFormTemplateServerFn,
} from '@/server/forms'
import type { FormFieldDefinition } from '@/lib/form.types'
import { FORM_CATEGORY_LABELS } from '@/lib/form.types'
import { FieldBuilder } from '@/components/form-builder/FieldBuilder'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/forms/templates/$templateId',
)({
  loader: async ({ params }) => {
    const result = await getFormTemplateServerFn({
      data: { orgSlug: params.orgSlug, templateId: params.templateId },
    })
    if (!result.success) throw new Error('Template not found')
    return { template: result.template, currentVersion: result.currentVersion }
  },
  component: EditFormTemplate,
})

function EditFormTemplate() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { template: initialTemplate, currentVersion } = Route.useLoaderData()
  const navigate = useNavigate()
  const canManage = canDo(userRole, 'manage-forms')

  const [name, setName] = useState(initialTemplate.name)
  const [description, setDescription] = useState(initialTemplate.description ?? '')
  const [fields, setFields] = useState<FormFieldDefinition[]>(currentVersion.fields)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isArchived = initialTemplate.status === 'archived'

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    const result = await updateFormTemplateServerFn({
      data: {
        orgSlug: org.slug,
        templateId: initialTemplate.id,
        name: name.trim(),
        description: description.trim() || undefined,
        fields,
      },
    })
    setSaving(false)
    if (result.success) {
      setSuccess('Template saved.')
    } else {
      setError(result.error === 'ARCHIVED' ? 'Cannot edit an archived template.' : 'Failed to save.')
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setError(null)
    setSuccess(null)
    const result = await publishFormTemplateServerFn({
      data: { orgSlug: org.slug, templateId: initialTemplate.id },
    })
    setPublishing(false)
    if (result.success) {
      setSuccess('Template published! Staff can now fill it out.')
    } else {
      const msgs: Record<string, string> = {
        NO_FIELDS: 'Add at least one data field before publishing.',
        ALREADY_PUBLISHED: 'This template is already published.',
      }
      setError(msgs[result.error] ?? 'Failed to publish.')
    }
  }

  async function handleArchive() {
    setArchiving(true)
    setError(null)
    const result = await archiveFormTemplateServerFn({
      data: { orgSlug: org.slug, templateId: initialTemplate.id },
    })
    setArchiving(false)
    if (result.success) {
      void navigate({ to: '/orgs/$orgSlug/forms', params: { orgSlug: org.slug } })
    } else {
      setError('Failed to archive.')
    }
  }

  const inputClass =
    'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => void navigate({ to: '/orgs/$orgSlug/forms', params: { orgSlug: org.slug } })}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Forms
        </button>
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-gray-400"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            v{currentVersion.versionNumber}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
              initialTemplate.status === 'published'
                ? 'bg-green-50 text-green-700'
                : initialTemplate.status === 'archived'
                  ? 'bg-gray-100 text-gray-400'
                  : 'bg-gray-100 text-gray-600'
            }`}
            style={{ fontFamily: 'var(--font-condensed)' }}
          >
            {initialTemplate.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2
          className="text-lg font-bold text-navy-700"
          style={{ fontFamily: 'var(--font-condensed)' }}
        >
          Template Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isArchived}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <input
              type="text"
              value={FORM_CATEGORY_LABELS[initialTemplate.category as keyof typeof FORM_CATEGORY_LABELS]}
              disabled
              className={`${inputClass} bg-gray-50`}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isArchived}
            rows={2}
            className={inputClass}
          />
        </div>
      </div>

      {!isArchived && <FieldBuilder fields={fields} onChange={setFields} />}

      {isArchived && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">
            This template is archived and cannot be edited. Existing submissions are preserved.
          </p>
        </div>
      )}

      {canManage && !isArchived && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => void handleArchive()}
            disabled={archiving}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            {archiving ? 'Archiving…' : 'Archive template'}
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-navy-700 border border-navy-300 rounded-lg hover:bg-navy-50 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            {initialTemplate.status !== 'published' && (
              <button
                onClick={() => void handlePublish()}
                disabled={publishing}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50"
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
