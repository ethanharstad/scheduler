import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie, getRequestUrl } from '@tanstack/react-start/server'
import {
  hashPassword,
  verifyPassword,
  generateToken,
  logSecurityEvent,
} from '@/lib/auth'
import { sendEmail } from '@/server/_email'

// ---------------------------------------------------------------------------
// T007: Input validation helpers
// ---------------------------------------------------------------------------

/** Returns true if the email has a valid format. Does not normalise case. */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Returns true if the password meets minimum strength requirements (≥8 chars, ≥1 letter, ≥1 digit). */
export function validatePasswordStrength(password: string): boolean {
  return (
    password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password)
  )
}

// ---------------------------------------------------------------------------
// T012: loginServerFn (US1)
// ---------------------------------------------------------------------------

type LoginInput = { email: string; password: string; from?: string }
type LoginOutput =
  | { success: true; redirectTo: string }
  | {
    success: false
    error: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'EMAIL_UNVERIFIED'
    lockedUntil?: string
  }

export const loginServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: LoginInput) => d)
  .handler(async (ctx): Promise<LoginOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const email = data.email.trim().toLowerCase()

    type UserRow = {
      id: string
      password_hash: string
      verified: 0 | 1
      failed_attempts: number
      lock_until: string | null
    }
    const user = await env.DB.prepare(
      `SELECT id, password_hash, verified, failed_attempts, lock_until
       FROM user WHERE email = ?`,
    )
      .bind(email)
      .first<UserRow>()

    if (!user) return { success: false, error: 'INVALID_CREDENTIALS' }

    const now = new Date().toISOString()

    if (user.lock_until && user.lock_until > now) {
      logSecurityEvent({
        type: 'failed_login_attempt',
        email,
        details: { reason: 'account_locked' },
      })
      return { success: false, error: 'ACCOUNT_LOCKED', lockedUntil: user.lock_until }
    }

    const isValid = await verifyPassword(data.password, user.password_hash)
    if (!isValid) {
      const newAttempts = user.failed_attempts + 1
      if (newAttempts >= 10) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
        await env.DB.prepare(
          `UPDATE user SET failed_attempts = ?, lock_until = ? WHERE id = ?`,
        )
          .bind(newAttempts, lockUntil, user.id)
          .run()
        logSecurityEvent({
          type: 'account_lockout_triggered',
          email,
          userId: user.id,
          details: { attempts: newAttempts },
        })
      } else {
        await env.DB.prepare(
          `UPDATE user SET failed_attempts = ? WHERE id = ?`,
        )
          .bind(newAttempts, user.id)
          .run()
        logSecurityEvent({
          type: 'failed_login_attempt',
          email,
          details: { reason: 'wrong_password', attempts: newAttempts },
        })
      }
      return { success: false, error: 'INVALID_CREDENTIALS' }
    }

    if (user.verified === 0) {
      logSecurityEvent({
        type: 'failed_login_attempt',
        email,
        details: { reason: 'unverified' },
      })
      return { success: false, error: 'EMAIL_UNVERIFIED' }
    }

    await env.DB.prepare(
      `UPDATE user SET failed_attempts = 0, lock_until = NULL WHERE id = ?`,
    )
      .bind(user.id)
      .run()

    const sessionToken = generateToken()
    const sessionId = globalThis.crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await env.DB.prepare(
      `INSERT INTO session (id, user_id, session_token, created_at, last_activity_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(sessionId, user.id, sessionToken, now, now, expiresAt)
      .run()

    setCookie('session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    })

    logSecurityEvent({ type: 'session_created', email, userId: user.id })
    return { success: true, redirectTo: data.from ?? '/orgs' }
  })

// ---------------------------------------------------------------------------
// T015: registerServerFn (US2)
// ---------------------------------------------------------------------------

type RegisterInput = { email: string; password: string }
type RegisterOutput =
  | { success: true }
  | {
    success: false
    error: 'EMAIL_TAKEN' | 'INVALID_INPUT'
    field?: 'email' | 'password'
  }

export const registerServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: RegisterInput) => d)
  .handler(async (ctx): Promise<RegisterOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const email = data.email.trim().toLowerCase()

    if (!validateEmail(email)) {
      return { success: false, error: 'INVALID_INPUT', field: 'email' }
    }
    if (!validatePasswordStrength(data.password)) {
      return { success: false, error: 'INVALID_INPUT', field: 'password' }
    }

    const existing = await env.DB.prepare(`SELECT id FROM user WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>()
    if (existing) return { success: false, error: 'EMAIL_TAKEN' }

    const passwordHash = await hashPassword(data.password)
    const userId = globalThis.crypto.randomUUID()
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO user (id, email, password_hash, verified, failed_attempts, created_at)
       VALUES (?, ?, ?, 0, 0, ?)`,
    )
      .bind(userId, email, passwordHash, now)
      .run()

    const token = generateToken()
    const tokenId = globalThis.crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await env.DB.prepare(
      `INSERT INTO email_verification_token (id, user_id, token, created_at, expires_at, used)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
      .bind(tokenId, userId, token, now, expiresAt)
      .run()

    await sendVerificationEmail(email, token, env)
    return { success: true }
  })

// ---------------------------------------------------------------------------
// T016: verifyEmailServerFn (US2)
// ---------------------------------------------------------------------------

type VerifyEmailInput = { token: string }
type VerifyEmailOutput =
  | { success: true }
  | { success: false; error: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'ALREADY_USED' }

export const verifyEmailServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: VerifyEmailInput) => d)
  .handler(async (ctx): Promise<VerifyEmailOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const now = new Date().toISOString()

    type TokenRow = { id: string; user_id: string; expires_at: string; used: 0 | 1 }
    const tokenRow = await env.DB.prepare(
      `SELECT id, user_id, expires_at, used
       FROM email_verification_token WHERE token = ?`,
    )
      .bind(data.token)
      .first<TokenRow>()

    if (!tokenRow) return { success: false, error: 'INVALID_TOKEN' }
    if (tokenRow.used === 1) return { success: false, error: 'ALREADY_USED' }
    if (tokenRow.expires_at < now) return { success: false, error: 'EXPIRED_TOKEN' }

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE email_verification_token SET used = 1 WHERE id = ?`,
      ).bind(tokenRow.id),
      env.DB.prepare(`UPDATE user SET verified = 1 WHERE id = ?`).bind(
        tokenRow.user_id,
      ),
    ])

    return { success: true }
  })

// ---------------------------------------------------------------------------
// T017: resendVerificationServerFn (US2)
// ---------------------------------------------------------------------------

type ResendVerificationInput = { email: string }
type ResendVerificationOutput =
  | { success: true }
  | {
    success: false
    error: 'COOLDOWN' | 'ALREADY_VERIFIED'
    retryAfter?: number
  }

export const resendVerificationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ResendVerificationInput) => d)
  .handler(async (ctx): Promise<ResendVerificationOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const email = data.email.trim().toLowerCase()
    const now = new Date().toISOString()

    const user = await env.DB.prepare(
      `SELECT id, verified FROM user WHERE email = ?`,
    )
      .bind(email)
      .first<{ id: string; verified: 0 | 1 }>()

    if (!user) return { success: true } // no enumeration
    if (user.verified === 1) return { success: false, error: 'ALREADY_VERIFIED' }

    const latest = await env.DB.prepare(
      `SELECT created_at FROM email_verification_token
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(user.id)
      .first<{ created_at: string }>()

    if (latest) {
      const elapsed = Date.now() - new Date(latest.created_at).getTime()
      if (elapsed < 60_000) {
        return {
          success: false,
          error: 'COOLDOWN',
          retryAfter: Math.ceil((60_000 - elapsed) / 1000),
        }
      }
    }

    await env.DB.prepare(
      `UPDATE email_verification_token SET used = 1 WHERE user_id = ? AND used = 0`,
    )
      .bind(user.id)
      .run()

    const token = generateToken()
    const tokenId = globalThis.crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await env.DB.prepare(
      `INSERT INTO email_verification_token (id, user_id, token, created_at, expires_at, used)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
      .bind(tokenId, user.id, token, now, expiresAt)
      .run()

    await sendVerificationEmail(email, token, env)
    return { success: true }
  })

// ---------------------------------------------------------------------------
// T020: forgotPasswordServerFn (US3)
// ---------------------------------------------------------------------------

export const forgotPasswordServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string }) => d)
  .handler(async (ctx): Promise<{ success: true }> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const email = data.email.trim().toLowerCase()
    const now = new Date().toISOString()

    const user = await env.DB.prepare(`SELECT id FROM user WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>()

    if (!user) return { success: true } // no enumeration

    const latest = await env.DB.prepare(
      `SELECT created_at FROM password_reset_token
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(user.id)
      .first<{ created_at: string }>()

    if (latest) {
      const elapsed = Date.now() - new Date(latest.created_at).getTime()
      if (elapsed < 60_000) return { success: true } // silent cooldown
    }

    await env.DB.prepare(
      `UPDATE password_reset_token SET used = 1 WHERE user_id = ? AND used = 0`,
    )
      .bind(user.id)
      .run()

    const token = generateToken()
    const tokenId = globalThis.crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await env.DB.prepare(
      `INSERT INTO password_reset_token (id, user_id, token, created_at, expires_at, used)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
      .bind(tokenId, user.id, token, now, expiresAt)
      .run()

    await sendPasswordResetEmail(email, token, env)
    return { success: true }
  })

// ---------------------------------------------------------------------------
// T021: resetPasswordServerFn (US3)
// ---------------------------------------------------------------------------

type ResetPasswordInput = { token: string; password: string }
type ResetPasswordOutput =
  | { success: true }
  | {
    success: false
    error: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'ALREADY_USED' | 'INVALID_INPUT'
  }

export const resetPasswordServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ResetPasswordInput) => d)
  .handler(async (ctx): Promise<ResetPasswordOutput> => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
    const now = new Date().toISOString()

    type TokenRow = { id: string; user_id: string; expires_at: string; used: 0 | 1 }
    const tokenRow = await env.DB.prepare(
      `SELECT id, user_id, expires_at, used FROM password_reset_token WHERE token = ?`,
    )
      .bind(data.token)
      .first<TokenRow>()

    if (!tokenRow) return { success: false, error: 'INVALID_TOKEN' }
    if (tokenRow.used === 1) return { success: false, error: 'ALREADY_USED' }
    if (tokenRow.expires_at < now) return { success: false, error: 'EXPIRED_TOKEN' }

    if (!validatePasswordStrength(data.password)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    const newHash = await hashPassword(data.password)
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE user SET password_hash = ? WHERE id = ?`,
      ).bind(newHash, tokenRow.user_id),
      env.DB.prepare(
        `UPDATE password_reset_token SET used = 1 WHERE id = ?`,
      ).bind(tokenRow.id),
      env.DB.prepare(`DELETE FROM session WHERE user_id = ?`).bind(
        tokenRow.user_id,
      ),
    ])

    const userRow = await env.DB.prepare(`SELECT email FROM user WHERE id = ?`)
      .bind(tokenRow.user_id)
      .first<{ email: string }>()

    logSecurityEvent({
      type: 'password_changed',
      userId: tokenRow.user_id,
      email: userRow?.email,
    })

    return { success: true }
  })

// ---------------------------------------------------------------------------
// T024: logoutServerFn (US4)
// ---------------------------------------------------------------------------

export const logoutServerFn = createServerFn({ method: 'POST' }).handler(
  async (ctx): Promise<{ success: true }> => {
    const env = ctx.context as unknown as Cloudflare.Env
    const sessionToken = getCookie('session')
    if (sessionToken) {
      type SessionRow = { id: string; user_id: string }
      const row = await env.DB.prepare(
        `SELECT id, user_id FROM session WHERE session_token = ?`,
      )
        .bind(sessionToken)
        .first<SessionRow>()

      if (row) {
        await env.DB.prepare(`DELETE FROM session WHERE id = ?`)
          .bind(row.id)
          .run()
        logSecurityEvent({ type: 'session_terminated', userId: row.user_id })
      }

      setCookie('session', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      })
    }
    return { success: true }
  },
)

// ---------------------------------------------------------------------------
// Internal: Email delivery helpers (uses shared _email module)
// ---------------------------------------------------------------------------

async function sendVerificationEmail(
  email: string,
  token: string,
  env: Cloudflare.Env,
): Promise<void> {
  const origin = getRequestOrigin()
  const url = `${origin}/verify-email/${token}`
  await sendEmail(env, {
    to: email,
    subject: 'Verify your email address',
    html: `<p>Click <a href="${url}">here</a> to verify your email. This link expires in 24 hours.</p>`,
  })
}

async function sendPasswordResetEmail(
  email: string,
  token: string,
  env: Cloudflare.Env,
): Promise<void> {
  const origin = getRequestOrigin()
  const url = `${origin}/reset-password/${token}`
  await sendEmail(env, {
    to: email,
    subject: 'Reset your password',
    html: `<p>Click <a href="${url}">here</a> to reset your password. This link expires in 60 minutes.</p>`,
  })
}

function getRequestOrigin(): string {
  try {
    return getRequestUrl().origin
  } catch {
    return 'http://localhost:3000'
  }
}
