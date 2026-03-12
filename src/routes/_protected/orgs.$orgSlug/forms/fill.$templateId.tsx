import { createFileRoute, useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getFormTemplateServerFn, submitFormServerFn } from '@/server/forms'
import type { LinkedEntityType } from '@/lib/form.types'
import { FormRenderer, type FormValues, type FormErrors } from '@/components/form-renderer/FormRenderer'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/forms/fill/$templateId',
)({
  validateSearch: (search: Record<string, unknown>): { entityType?: string; entityId?: string; scheduleId?: string } => ({
    entityType: (search.entityType as string) || undefined,
    entityId: (search.entityId as string) || undefined,
    scheduleId: (search.scheduleId as string) || undefined,
  }),
  loader: async ({ params }) => {
    const result = await getFormTemplateServerFn({
      data: { orgSlug: params.orgSlug, templateId: params.templateId },
    })
    if (!result.success) throw new Error('Template not found')
    return { template: result.template, currentVersion: result.currentVersion }
  },
  component: FillForm,
})

function FillForm() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { template, currentVersion } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()

  const [values, setValues] = useState<FormValues>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function setValue(key: string, val: FormValues[string]) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    setErrors({})

    const result = await submitFormServerFn({
      data: {
        orgSlug: org.slug,
        templateId: template.id,
        linkedEntityType: search.entityType as LinkedEntityType | undefined,
        linkedEntityId: search.entityId,
        scheduleId: search.scheduleId,
        values,
      },
    })

    setSubmitting(false)
    if (result.success) {
      void navigate({
        to: '/orgs/$orgSlug/forms/submissions/$submissionId',
        params: { orgSlug: org.slug, submissionId: result.submission.id },
      })
    } else if (result.error === 'VALIDATION_ERROR' && result.validationErrors) {
      setErrors(result.validationErrors)
    } else {
      const msgs: Record<string, string> = {
        NOT_PUBLISHED: 'This form is not yet published.',
        NOT_FOUND: 'Form template not found.',
        UNAUTHORIZED: 'You are not authorized.',
        FORBIDDEN: 'You do not have permission to submit forms.',
      }
      setSubmitError(msgs[result.error] ?? 'Failed to submit form.')
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => void navigate({ to: '/orgs/$orgSlug/forms', params: { orgSlug: org.slug } })}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Forms
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2
          className="text-xl font-bold text-navy-700"
          style={{ fontFamily: 'var(--font-condensed)' }}
        >
          {template.name}
        </h2>
        {template.description && (
          <p className="text-sm text-gray-500 mt-1">{template.description}</p>
        )}
      </div>

      {submitError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {submitError}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <FormRenderer
          fields={currentVersion.fields}
          values={values}
          errors={errors}
          onChange={setValue}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => void navigate({ to: '/orgs/$orgSlug/forms', params: { orgSlug: org.slug } })}
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit Form'}
        </button>
      </div>
    </div>
  )
}
