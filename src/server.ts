import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

const handler = createStartHandler(defaultStreamHandler)

export default {
  fetch(request: Request, env: Cloudflare.Env, _ctx: ExecutionContext) {
    // Pass Cloudflare env as request context so server functions can access DB and secrets.
    // The `as never` cast is needed because TanStack's BaseContext intersection type doesn't
    // overlap with Cloudflare.Env, but at runtime the context is passed through correctly.
    return handler(request, { context: env as never })
  },
}
