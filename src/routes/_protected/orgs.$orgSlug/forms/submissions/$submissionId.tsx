import { createFileRoute, useNavigate, useRouteContext } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { getSubmissionServerFn } from '@/server/forms'
import type { FormFieldDefinition, FormResponseValueView } from '@/lib/form.types'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/forms/submissions/$submissionId',
)({
  loader: async ({ params }) => {
    const result = await getSubmissionServerFn({
      data: { orgSlug: params.orgSlug, submissionId: params.submissionId },
    })
    if (!result.success) throw new Error('Submission not found')
    return { submission: result.submission }
  },
  component: SubmissionDetail,
})

function SubmissionDetail() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { submission } = Route.useLoaderData()
  const navigate = useNavigate()

  const valueMap = new Map<string, FormResponseValueView>()
  for (const v of submission.values) {
    valueMap.set(v.fieldKey, v)
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() =>
          void navigate({
            to: '/orgs/$orgSlug/forms/submissions',
            params: { orgSlug: org.slug },
          })
        }
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Submissions
      </button>

      {/* Metadata */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2
          className="text-xl font-bold text-navy-700"
          style={{ fontFamily: 'var(--font-condensed)' }}
        >
          {submission.templateName}
        </h2>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Submitted by:</span>{' '}
            <span className="font-medium text-gray-900">{submission.submittedByName}</span>
          </div>
          <div>
            <span className="text-gray-500">Date:</span>{' '}
            <span className="font-medium text-gray-900" style={{ fontFamily: 'var(--font-mono)' }}>
              {submission.submittedAt.slice(0, 10)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Version:</span>{' '}
            <span className="font-medium text-gray-900" style={{ fontFamily: 'var(--font-mono)' }}>
              v{submission.versionNumber}
            </span>
          </div>
        </div>
        {submission.linkedEntityType && (
          <div className="mt-2 text-sm">
            <span className="text-gray-500">Linked to:</span>{' '}
            <span className="font-medium text-gray-900">
              {submission.linkedEntityType} — {submission.linkedEntityId}
            </span>
          </div>
        )}
      </div>

      {/* Form responses */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <ReadOnlyFields
          fields={submission.fields}
          valueMap={valueMap}
          prefix=""
        />
      </div>
    </div>
  )
}

function ReadOnlyFields({
  fields,
  valueMap,
  prefix,
}: {
  fields: FormFieldDefinition[]
  valueMap: Map<string, FormResponseValueView>
  prefix: string
}) {
  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const key = `${prefix}${field.key}`

        if (field.type === 'divider') {
          return <hr key={key} className="border-gray-200" />
        }

        if (field.type === 'section_header') {
          return (
            <h3
              key={key}
              className="text-base font-bold text-navy-700 pt-2"
              style={{ fontFamily: 'var(--font-condensed)' }}
            >
              {field.label}
            </h3>
          )
        }

        if (field.type === 'repeating_group' && 'children' in field) {
          // Find all entries
          const groupPrefix = `${prefix}${field.key}[`
          const maxIdx = Array.from(valueMap.keys())
            .filter((k) => k.startsWith(groupPrefix))
            .map((k) => {
              const match = k.match(/\[(\d+)\]/)
              return match ? parseInt(match[1], 10) : -1
            })
            .reduce((max, n) => Math.max(max, n), -1)

          if (maxIdx < 0) {
            return (
              <div key={key}>
                <span className="text-sm font-medium text-gray-700">{field.label}</span>
                <p className="text-sm text-gray-400 italic">No entries</p>
              </div>
            )
          }

          return (
            <div key={key}>
              <span className="text-sm font-medium text-gray-700 block mb-2">{field.label}</span>
              <div className="space-y-3">
                {Array.from({ length: maxIdx + 1 }, (_, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <span
                      className="text-xs font-semibold text-gray-500 uppercase mb-2 block"
                      style={{ fontFamily: 'var(--font-condensed)' }}
                    >
                      Entry {i + 1}
                    </span>
                    <ReadOnlyFields
                      fields={field.children}
                      valueMap={valueMap}
                      prefix={`${prefix}${field.key}[${i}].`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        }

        const rv = valueMap.get(key)

        return (
          <div key={key} className="flex flex-col sm:flex-row sm:items-baseline gap-1">
            <span className="text-sm font-medium text-gray-700 sm:w-48 shrink-0">
              {field.label}
            </span>
            <span className="text-sm text-gray-900">
              {formatValue(field, rv)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function formatValue(
  field: FormFieldDefinition,
  rv: FormResponseValueView | undefined,
): string {
  if (!rv) return '—'

  switch (field.type) {
    case 'boolean':
      if (rv.valueBoolean === null || rv.valueBoolean === undefined) return '—'
      if ('trueLabel' in field && 'falseLabel' in field) {
        return rv.valueBoolean ? (field.trueLabel ?? 'Yes') : (field.falseLabel ?? 'No')
      }
      return rv.valueBoolean ? 'Yes' : 'No'

    case 'number':
      if (rv.valueNumber === null || rv.valueNumber === undefined) return '—'
      return `${rv.valueNumber}${'unit' in field && field.unit ? ` ${field.unit}` : ''}`

    case 'multi_select': {
      if (!rv.valueText) return '—'
      try {
        const arr = JSON.parse(rv.valueText) as string[]
        if ('options' in field) {
          return arr
            .map((v) => field.options.find((o) => o.value === v)?.label ?? v)
            .join(', ')
        }
        return arr.join(', ')
      } catch {
        return rv.valueText
      }
    }

    case 'select':
      if (!rv.valueText) return '—'
      if ('options' in field) {
        return field.options.find((o) => o.value === rv.valueText)?.label ?? rv.valueText
      }
      return rv.valueText

    default:
      return rv.valueText ?? '—'
  }
}
