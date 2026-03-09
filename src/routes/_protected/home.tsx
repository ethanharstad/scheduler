import { createFileRoute, useRouteContext } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/home')({
  head: () => ({
    meta: [{ title: 'Home | Scene Ready' }],
  }),
  component: HomePage,
})

function HomePage() {
  const { session } = useRouteContext({ from: '/_protected' })

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-700 mb-2">
        Welcome back, {session.email}
      </h1>
      <p className="text-gray-600">You are signed in to Scene Ready.</p>
    </div>
  )
}
