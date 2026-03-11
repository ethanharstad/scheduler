import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { listSubmissionsServerFn } from '@/server/forms'
import type { FormSubmissionView } from '@/lib/form.types'

export const Route = createFileRoute(
  '/_protected/orgs/$orgSlug/forms/submissions',
)({
  loader: async ({ params }) => {
    const result = await listSubmissionsServerFn({
      data: { orgSlug: params.orgSlug, limit: 50 },
    })
    return {
      submissions: result.success ? result.submissions : [],
      total: result.success ? result.total : 0,
    }
  },
  component: SubmissionsList,
})

function SubmissionsList() {
  const { org } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { submissions: initial, total } = Route.useLoaderData()
  const [submissions] = useState<FormSubmissionView[]>(initial)

  if (submissions.length === 0) {
    return (
      <p className="text-center py-16 text-gray-400">
        No form submissions yet.
      </p>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">{total} total submissions</p>
      <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                style={{ fontFamily: 'var(--font-condensed)' }}
              >
                Form
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                style={{ fontFamily: 'var(--font-condensed)' }}
              >
                Submitted By
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                style={{ fontFamily: 'var(--font-condensed)' }}
              >
                Date
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                style={{ fontFamily: 'var(--font-condensed)' }}
              >
                Status
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr
                key={s.id}
                className="border-b border-gray-200 last:border-0 hover:bg-gray-50"
              >
                <td className="px-4 py-3 font-medium text-navy-700">
                  {s.templateName}
                </td>
                <td className="px-4 py-3 text-gray-600">{s.submittedByName}</td>
                <td
                  className="px-4 py-3 text-gray-500"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {s.submittedAt.slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
                      s.status === 'complete'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-yellow-50 text-yellow-700'
                    }`}
                    style={{ fontFamily: 'var(--font-condensed)' }}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to="/orgs/$orgSlug/forms/submissions/$submissionId"
                    params={{ orgSlug: org.slug, submissionId: s.id }}
                    className="text-xs text-navy-700 hover:underline font-medium"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
