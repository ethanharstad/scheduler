import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/schedules/requirements')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/orgs/$orgSlug/settings/scheduling/requirements',
      params: { orgSlug: params.orgSlug },
    })
  },
})
