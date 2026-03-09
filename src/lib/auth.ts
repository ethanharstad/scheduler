import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import type { SessionContext } from './auth.types'

// ---------------------------------------------------------------------------
// Password hashing — PBKDF2-SHA256 via Web Crypto API (Workers-native)
// ---------------------------------------------------------------------------

/** Hashes a plaintext password. Returns base64(salt[32] || derivedKey[32]). */
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    keyMaterial,
    256,
  )
  const combined = new Uint8Array(64)
  combined.set(salt, 0)
  combined.set(new Uint8Array(derivedBits), 32)
  return btoa(String.fromCharCode(...combined))
}

/** Verifies a plaintext password against a stored hash (constant-time). */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const enc = new TextEncoder()
  let combined: Uint8Array
  try {
    combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0))
  } catch {
    return false
  }
  if (combined.length !== 64) return false
  const salt = combined.slice(0, 32)
  const expected = combined.slice(32)
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    keyMaterial,
    256,
  )
  const actual = new Uint8Array(derivedBits)
  // Constant-time XOR comparison
  let diff = 0
  for (let i = 0; i < 32; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

/** Generates a cryptographically secure 32-byte random token as base64url. */
export function generateToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// ---------------------------------------------------------------------------
// Security event logger (FR-014)
// ---------------------------------------------------------------------------

type SecurityEventType =
  | 'failed_login_attempt'
  | 'account_lockout_triggered'
  | 'account_lockout_lifted'
  | 'password_changed'
  | 'session_created'
  | 'session_terminated'

export function logSecurityEvent(event: {
  type: SecurityEventType
  email?: string
  userId?: string
  details?: Record<string, unknown>
}): void {
  console.log(
    JSON.stringify({ ...event, timestamp: new Date().toISOString() }),
  )
}

// ---------------------------------------------------------------------------
// Session validation server function
// ---------------------------------------------------------------------------

export const getSessionServerFn = createServerFn({ method: 'GET' }).handler(
  async (ctx): Promise<SessionContext | null> => {
    const env = ctx.context as unknown as Cloudflare.Env
    const sessionToken = getCookie('session')
    if (!sessionToken) return null
    const now = new Date().toISOString()

    const row = await env.DB.prepare(
      `SELECT s.id, s.user_id, s.expires_at, u.email, u.is_system_admin,
              COALESCE(p.display_name, u.email) AS display_name
       FROM session s
       JOIN user u ON s.user_id = u.id
       LEFT JOIN user_profile p ON p.user_id = u.id
       WHERE s.session_token = ? AND s.expires_at > ?`,
    )
      .bind(sessionToken, now)
      .first<{ id: string; user_id: string; expires_at: string; email: string; is_system_admin: number; display_name: string }>()

    if (!row) return null

    // Extend idle-expiry window (24 h from now)
    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await env.DB.prepare(
      `UPDATE session SET last_activity_at = ?, expires_at = ? WHERE id = ?`,
    )
      .bind(now, newExpiry, row.id)
      .run()

    // Refresh cookie Max-Age
    setCookie('session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    })

    return { userId: row.user_id, email: row.email, displayName: row.display_name, isSystemAdmin: row.is_system_admin === 1 }
  },
)
