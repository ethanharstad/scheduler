// Extends the auto-generated Cloudflare.Env with secret bindings
// that wrangler types does not include (set via `wrangler secret put`).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    RESEND_API_KEY: string
  }
}
