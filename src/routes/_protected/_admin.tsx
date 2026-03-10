import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/_admin')({
  beforeLoad: async ({ context }) => {
    if (!context.session.isSystemAdmin) {
      throw redirect({ to: '/orgs' })
    }
  },
  component: () => <Outlet />,
})
