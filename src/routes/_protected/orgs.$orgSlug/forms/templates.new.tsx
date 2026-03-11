import { createFileRoute, useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { createFormTemplateServerFn } from '@/server/forms'
import type { FormFieldDefinition, FormCategory } from '@/lib/form.types'
import { FORM_CATEGORIES, FORM_CATEGORY_LABELS } from '@/lib/form.types'
import { FieldBuilder } from '@/components/form-builder/FieldBuilder'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/forms/templates/new',
)({
  component: NewFormTemplate,
})

function NewFormTemplate() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<FormCategory>('equipment_inspection')
  const [fields, setFields] = useState<FormFieldDefinition[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await createFormTemplateServerFn({
      data: {
        orgSlug: org.slug,
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        fields,
      },
    })
    setSubmitting(false)
    if (result.success) {
      void navigate({
        to: '/orgs/$orgSlug/forms/templates/$templateId',
        params: { orgSlug: org.slug, templateId: result.template.id },
      })
    } else {
      setError(result.error === 'INVALID_INPUT' ? 'Invalid input. Check name and category.' : 'Failed to create template.')
    }
  }

  const inputClass =
    'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-6">
      <button
        onClick={() => void navigate({ to: '/orgs/$orgSlug/forms', params: { orgSlug: org.slug } })}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Forms
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
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
            <label className={labelClass}>
              Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily Apparatus Check"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FormCategory)}
              className={inputClass}
            >
              {FORM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {FORM_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional description of what this form is for…"
            className={inputClass}
          />
        </div>
      </div>

      <FieldBuilder fields={fields} onChange={setFields} />

      <div className="flex justify-end gap-3">
        <button
          onClick={() => void navigate({ to: '/orgs/$orgSlug/forms', params: { orgSlug: org.slug } })}
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={submitting}
          className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Template'}
        </button>
      </div>
    </div>
  )
}
