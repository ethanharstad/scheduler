import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/settings/qualifications')({
  component: () => <Outlet />,
})
