import { createFileRoute, useRouteContext } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/home')({
  component: HomePage,
})

function HomePage() {
  const { session } = useRouteContext({ from: '/_protected' })

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">
        Welcome back, {session.email}
      </h1>
      <p className="text-gray-400">You are signed in to Scheduler.</p>
    </main>
  )
}
