import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { Building2 } from 'lucide-react'
import { createOrgServerFn, listUserOrgsServerFn } from '@/server/org'

export const Route = createFileRoute('/_protected/create-org')({
  loader: async () => {
    const result = await listUserOrgsServerFn()
    if (!result.success) {
      throw redirect({ to: '/login', search: { from: '/create-org', verified: false, reset: false } })
    }
    if (result.atLimit) {
      throw redirect({ to: '/home' })
    }
    return {}
  },
  component: CreateOrgPage,
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function CreateOrgPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; slug?: string; form?: string }>({})

  function handleNameChange(value: string) {
    setName(value)
    if (!slugManuallyEdited) {
      setSlug(slugify(value))
    }
  }

  function handleSlugChange(value: string) {
    setSlugManuallyEdited(true)
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})
    setSubmitting(true)

    const result = await createOrgServerFn({ data: { name: name.trim(), slug: slug.trim() } })

    if (result.success) {
      await navigate({ to: '/orgs/$orgSlug', params: { orgSlug: result.orgSlug } })
      return
    }

    setSubmitting(false)
    if (result.error === 'SLUG_TAKEN') {
      setErrors({ slug: 'This URL slug is already taken. Please choose a different one.' })
    } else if (result.error === 'ORG_LIMIT_REACHED') {
      setErrors({ form: 'You have reached the maximum number of organizations (10). Contact support to increase your limit.' })
    } else if (result.error === 'INVALID_INPUT') {
      if (result.field === 'name') setErrors({ name: 'Name must be between 2 and 100 characters.' })
      else if (result.field === 'slug') setErrors({ slug: 'Slug must be 2–50 lowercase letters, numbers, or hyphens, with no leading or trailing hyphens.' })
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Building2 className="w-8 h-8 text-navy-500" />
        <h1 className="text-2xl font-bold text-navy-700">Create Organization</h1>
      </div>

      {errors.form && (
        <div className="mb-6 p-4 rounded-lg bg-danger-bg border border-danger/30 text-danger text-sm">
          {errors.form}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-600 mb-1.5">
              Organization Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="Springfield Fire Department"
              className="w-full px-4 py-2.5 rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
            />
            {errors.name && <p className="mt-1.5 text-sm text-danger">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-600 mb-1.5">
              URL Slug
            </label>
            <div className="flex items-center rounded-md bg-white border border-gray-300 focus-within:border-navy-500 focus-within:ring-1 focus-within:ring-navy-500/15 overflow-hidden">
              <span className="pl-4 pr-1 text-gray-400 text-sm whitespace-nowrap select-none">
                /orgs/
              </span>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
                minLength={2}
                maxLength={50}
                placeholder="springfield-fire"
                className="flex-1 px-2 py-2.5 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Lowercase letters, numbers, and hyphens only. Cannot be changed after creation.
            </p>
            {errors.slug && <p className="mt-1 text-sm text-danger">{errors.slug}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-md bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors mt-2"
          >
            {submitting ? 'Creating…' : 'Create Organization'}
          </button>
        </form>
      </div>
    </div>
  )
}
