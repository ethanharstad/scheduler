import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/qualifications/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/orgs/$orgSlug/qualifications/certifications',
      params: { orgSlug: params.orgSlug },
    })
  },
})
