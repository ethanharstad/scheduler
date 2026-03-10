import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/schedules/platoons')({
  component: () => <Outlet />,
})
