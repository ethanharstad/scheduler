import {
  createFileRoute,
  Outlet,
  redirect,
  useRouteContext,
} from '@tanstack/react-router'
import { OrgProvider } from '@/lib/org-context'
import { getOrgServerFn } from '@/server/org'

export const Route = createFileRoute('/_protected/orgs/$orgSlug')({
  beforeLoad: async ({ params }) => {
    const result = await getOrgServerFn({ data: { slug: params.orgSlug } })
    if (!result.success) {
      throw redirect({ to: '/orgs' })
    }
    return { org: result.org, userRole: result.userRole }
  },
  component: OrgLayout,
})

function OrgLayout() {
  const { org, userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })

  return (
    <OrgProvider value={{ org, userRole }}>
      <Outlet />
    </OrgProvider>
  )
}
