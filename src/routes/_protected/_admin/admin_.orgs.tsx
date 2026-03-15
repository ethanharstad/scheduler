import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Building2, Download, Loader2, Shield, Upload } from 'lucide-react'
import { listAllOrgsServerFn, backupOrgServerFn, restoreOrgServerFn } from '@/server/admin'
import type { OrgBackup } from '@/lib/admin.types'

export const Route = createFileRoute('/_protected/_admin/admin_/orgs')({
  loader: async () => {
    const result = await listAllOrgsServerFn({ data: {} })
    if (!result.success) throw new Error('Unauthorized')
    return result
  },
  head: () => ({ meta: [{ title: 'Organizations | Admin | Scene Ready' }] }),
  component: AdminOrgs,
})

function AdminOrgs() {
  const { orgs, total } = Route.useLoaderData()
  const [loadingBackup, setLoadingBackup] = useState<string | null>(null)
  const [loadingRestore, setLoadingRestore] = useState<string | null>(null)

  async function handleBackup(orgId: string, slug: string) {
    setLoadingBackup(orgId)
    try {
      const result = await backupOrgServerFn({ data: { orgId } })
      if (!result.success) {
        alert(`Backup failed: ${result.error}`)
        return
      }
      const json = JSON.stringify(result.backup, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${slug}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Backup failed unexpectedly')
    } finally {
      setLoadingBackup(null)
    }
  }

  function handleRestore(orgId: string, orgName: string) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      const confirmed = window.confirm(
        `This will replace ALL data for "${orgName}". This action cannot be undone. Continue?`,
      )
      if (!confirmed) return

      setLoadingRestore(orgId)
      try {
        const text = await file.text()
        const backup = JSON.parse(text) as OrgBackup
        const result = await restoreOrgServerFn({ data: { orgId, backup } })
        if (!result.success) {
          alert(`Restore failed: ${result.error}`)
        } else {
          alert('Restore completed successfully')
        }
      } catch {
        alert('Restore failed: invalid JSON file')
      } finally {
        setLoadingRestore(null)
      }
    }
    input.click()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-red-700" />
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: 'var(--font-condensed)' }}>
            Organizations
          </h1>
        </div>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Slug</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Plan</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Members</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Created</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    to="/orgs/$orgSlug"
                    params={{ orgSlug: org.slug }}
                    className="font-medium text-navy-700 hover:underline flex items-center gap-2"
                  >
                    <Building2 className="w-4 h-4 text-gray-400" />
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{org.slug}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 capitalize">
                    {org.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                    org.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {org.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{org.memberCount}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(org.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => handleBackup(org.id, org.slug)}
                      disabled={loadingBackup === org.id}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-navy-700 disabled:opacity-50"
                      title="Backup"
                    >
                      {loadingBackup === org.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Download className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleRestore(org.id, org.name)}
                      disabled={loadingRestore === org.id}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-navy-700 disabled:opacity-50"
                      title="Restore"
                    >
                      {loadingRestore === org.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Upload className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
