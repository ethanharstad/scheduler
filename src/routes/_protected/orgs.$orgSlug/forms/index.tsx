import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { ClipboardList, Copy, FileText, Pill } from 'lucide-react'
import { canDo } from '@/lib/rbac'
import { listFormTemplatesServerFn, cloneSystemTemplateServerFn } from '@/server/forms'
import type { FormTemplateView, FormCategory } from '@/lib/form.types'
import { FORM_CATEGORY_LABELS } from '@/lib/form.types'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/forms/')({
  loader: async ({ params }) => {
    const [orgResult, systemResult] = await Promise.all([
      listFormTemplatesServerFn({ data: { orgSlug: params.orgSlug } }),
      listFormTemplatesServerFn({ data: { orgSlug: params.orgSlug, includeSystem: true } }),
    ])
    const orgTemplates: FormTemplateView[] = orgResult.success ? orgResult.templates : []
    const allTemplates: FormTemplateView[] = systemResult.success ? systemResult.templates : []
    const systemTemplates: FormTemplateView[] = allTemplates.filter((t) => t.isSystem)
    return { orgTemplates, systemTemplates }
  },
  component: FormTemplateList,
})

const categoryIcons: Record<FormCategory, React.ReactNode> = {
  equipment_inspection: <ClipboardList className="w-4 h-4" />,
  property_inspection: <FileText className="w-4 h-4" />,
  medication: <Pill className="w-4 h-4" />,
  custom: <ClipboardList className="w-4 h-4" />,
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-50 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
}

function FormTemplateList() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })
  const { orgTemplates, systemTemplates } = Route.useLoaderData()
  const canManage = canDo(userRole, 'manage-forms')
  const canSubmit = canDo(userRole, 'submit-forms')
  const [cloning, setCloning] = useState<string | null>(null)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<FormTemplateView[]>(orgTemplates)

  async function handleClone(systemTemplateId: string) {
    setCloning(systemTemplateId)
    setCloneError(null)
    const result = await cloneSystemTemplateServerFn({
      data: { orgSlug: org.slug, systemTemplateId },
    })
    setCloning(null)
    if (result.success) {
      setTemplates((prev) => [result.template, ...prev])
    } else {
      setCloneError('Failed to clone template')
    }
  }

  const publishedTemplates = templates.filter((t) => t.status === 'published')

  return (
    <div className="space-y-8">
      {/* Fillable forms for all users with submit-forms */}
      {canSubmit && publishedTemplates.length > 0 && (
        <div>
          <h2
            className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3"
            style={{ fontFamily: 'var(--font-condensed)' }}
          >
            Available Forms
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publishedTemplates.map((t) => (
              <Link
                key={t.id}
                to="/orgs/$orgSlug/forms/fill/$templateId"
                params={{ orgSlug: org.slug, templateId: t.id }}
                className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:border-navy-300 hover:shadow-md transition-all"
              >
                <span className="mt-0.5 text-navy-700">
                  {categoryIcons[t.category]}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-navy-700 text-sm">{t.name}</div>
                  {t.description && (
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {FORM_CATEGORY_LABELS[t.category]}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Template management for managers+ */}
      {canManage && (
        <div>
          <h2
            className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3"
            style={{ fontFamily: 'var(--font-condensed)' }}
          >
            Your Templates
          </h2>
          {templates.length === 0 ? (
            <p className="text-center py-12 text-gray-400">
              No form templates yet. Create one or clone a starter template below.
            </p>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                      style={{ fontFamily: 'var(--font-condensed)' }}
                    >
                      Name
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                      style={{ fontFamily: 'var(--font-condensed)' }}
                    >
                      Category
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                      style={{ fontFamily: 'var(--font-condensed)' }}
                    >
                      Status
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                      style={{ fontFamily: 'var(--font-condensed)' }}
                    >
                      Version
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-gray-200 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to="/orgs/$orgSlug/forms/templates/$templateId"
                          params={{ orgSlug: org.slug, templateId: t.id }}
                          className="font-medium text-navy-700 hover:underline"
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {FORM_CATEGORY_LABELS[t.category]}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${statusColors[t.status] ?? ''}`}
                          style={{ fontFamily: 'var(--font-condensed)' }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-gray-500"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        v{t.currentVersionNumber}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.status === 'published' && canSubmit && (
                          <Link
                            to="/orgs/$orgSlug/forms/fill/$templateId"
                            params={{ orgSlug: org.slug, templateId: t.id }}
                            className="text-xs text-red-700 hover:underline font-medium"
                          >
                            Fill out →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* System templates */}
      {canManage && systemTemplates.length > 0 && (
        <div>
          <h2
            className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3"
            style={{ fontFamily: 'var(--font-condensed)' }}
          >
            Starter Templates
          </h2>
          {cloneError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {cloneError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {systemTemplates.map((t: FormTemplateView) => (
              <div
                key={t.id}
                className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-lg"
              >
                <span className="mt-0.5 text-gray-500">
                  {categoryIcons[t.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 text-sm">{t.name}</div>
                  {t.description && (
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {t.description}
                    </div>
                  )}
                  <button
                    onClick={() => void handleClone(t.id)}
                    disabled={cloning === t.id}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:text-navy-900 disabled:opacity-50"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {cloning === t.id ? 'Cloning…' : 'Clone to customize'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
