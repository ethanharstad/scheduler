import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { hashPassword, verifyPassword, logSecurityEvent } from '@/lib/auth'
import { validatePasswordStrength } from '@/server/auth'
import type {
  UserProfile,
  ProfileView,
  UpdateProfileInput,
  ChangePasswordInput,
  UploadPhotoInput,
} from '@/lib/profile.types'

// ---------------------------------------------------------------------------
// Shared helper — validate session and return userId + email + sessionToken
// ---------------------------------------------------------------------------

async function requireSession(
  env: Cloudflare.Env,
): Promise<{ userId: string; email: string; sessionToken: string } | null> {
  const sessionToken = getCookie('session')
  if (!sessionToken) return null
  const now = new Date().toISOString()
  const row = await env.DB.prepare(
    `SELECT s.user_id, u.email
     FROM session s
     JOIN user u ON s.user_id = u.id
     WHERE s.session_token = ? AND s.expires_at > ?`,
  )
    .bind(sessionToken, now)
    .first<{ user_id: string; email: string }>()
  if (!row) return null
  return { userId: row.user_id, email: row.email, sessionToken }
}

// ---------------------------------------------------------------------------
// Shared helper — fetch R2 photo as base64 data URL or null
// ---------------------------------------------------------------------------

async function fetchAvatarDataUrl(
  env: Cloudflare.Env,
  userId: string,
): Promise<string | null> {
  const key = `profile-photos/${userId}`
  let obj: R2ObjectBody | null = null
  try {
    obj = await env.PROFILE_PHOTOS.get(key)
  } catch {
    return null
  }
  if (!obj) return null
  const bytes = new Uint8Array(await obj.arrayBuffer())
  const b64 = btoa(String.fromCharCode(...bytes))
  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg'
  return `data:${contentType};base64,${b64}`
}

// ---------------------------------------------------------------------------
// Shared helper — build ProfileView from a user_profile row + email + env
// ---------------------------------------------------------------------------

async function buildProfileView(
  row: UserProfile,
  email: string,
  env: Cloudflare.Env,
): Promise<ProfileView> {
  const avatarDataUrl = row.avatar_key
    ? await fetchAvatarDataUrl(env, row.user_id)
    : null
  return {
    userId: row.user_id,
    email,
    displayName: row.display_name,
    phoneNumber: row.phone_number,
    avatarDataUrl,
  }
}

// ---------------------------------------------------------------------------
// T005: getProfileServerFn — lazy-creates user_profile row if absent
// ---------------------------------------------------------------------------

type GetProfileOutput =
  | { success: true; profile: ProfileView }
  | { success: false; error: 'UNAUTHENTICATED' }

export const getProfileServerFn = createServerFn({ method: 'GET' }).handler(
  async (ctx): Promise<GetProfileOutput> => {
    const env = ctx.context as unknown as Cloudflare.Env
    const auth = await requireSession(env)
    if (!auth) return { success: false, error: 'UNAUTHENTICATED' }

    const defaultName = auth.email.split('@')[0]
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_profile (user_id, display_name, phone_number, avatar_key, updated_at)
       VALUES (?, ?, NULL, NULL, ?)`,
    )
      .bind(auth.userId, defaultName, now)
      .run()

    const row = await env.DB.prepare(
      `SELECT user_id, display_name, phone_number, avatar_key, updated_at
       FROM user_profile WHERE user_id = ?`,
    )
      .bind(auth.userId)
      .first<UserProfile>()

    if (!row) return { success: false, error: 'UNAUTHENTICATED' }

    const profile = await buildProfileView(row, auth.email, env)
    return { success: true, profile }
  },
)

// ---------------------------------------------------------------------------
// T007: updateProfileServerFn
// ---------------------------------------------------------------------------

type UpdateProfileOutput =
  | { success: true; profile: ProfileView }
  | {
      success: false
      error: 'UNAUTHENTICATED' | 'INVALID_INPUT'
      field?: 'displayName' | 'phoneNumber'
    }

export const updateProfileServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateProfileInput) => d)
  .handler(async (ctx): Promise<UpdateProfileOutput> => {
    const env = ctx.context as unknown as Cloudflare.Env
    const { data } = ctx
    const auth = await requireSession(env)
    if (!auth) return { success: false, error: 'UNAUTHENTICATED' }

    const displayName = data.displayName.trim()
    if (!displayName || displayName.length > 100) {
      return { success: false, error: 'INVALID_INPUT', field: 'displayName' }
    }

    let phoneNumber: string | null = null
    if (data.phoneNumber && data.phoneNumber.trim() !== '') {
      const phone = data.phoneNumber.trim()
      if (!/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
        return { success: false, error: 'INVALID_INPUT', field: 'phoneNumber' }
      }
      phoneNumber = phone
    }

    const now = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE user_profile SET display_name = ?, phone_number = ?, updated_at = ? WHERE user_id = ?`,
    )
      .bind(displayName, phoneNumber, now, auth.userId)
      .run()

    const row = await env.DB.prepare(
      `SELECT user_id, display_name, phone_number, avatar_key, updated_at
       FROM user_profile WHERE user_id = ?`,
    )
      .bind(auth.userId)
      .first<UserProfile>()

    if (!row) return { success: false, error: 'UNAUTHENTICATED' }

    const profile = await buildProfileView(row, auth.email, env)
    return { success: true, profile }
  })

// ---------------------------------------------------------------------------
// T009: changePasswordServerFn
// ---------------------------------------------------------------------------

type ChangePasswordOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHENTICATED' | 'WRONG_PASSWORD' | 'INVALID_INPUT' }

export const changePasswordServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: ChangePasswordInput) => d)
  .handler(async (ctx): Promise<ChangePasswordOutput> => {
    const env = ctx.context as unknown as Cloudflare.Env
    const { data } = ctx
    const auth = await requireSession(env)
    if (!auth) return { success: false, error: 'UNAUTHENTICATED' }

    const userRow = await env.DB.prepare(
      `SELECT password_hash FROM user WHERE id = ?`,
    )
      .bind(auth.userId)
      .first<{ password_hash: string }>()

    if (!userRow) return { success: false, error: 'UNAUTHENTICATED' }

    const isValid = await verifyPassword(data.currentPassword, userRow.password_hash)
    if (!isValid) return { success: false, error: 'WRONG_PASSWORD' }

    if (!validatePasswordStrength(data.newPassword)) {
      return { success: false, error: 'INVALID_INPUT' }
    }

    const newHash = await hashPassword(data.newPassword)
    await env.DB.batch([
      env.DB.prepare(`UPDATE user SET password_hash = ? WHERE id = ?`).bind(
        newHash,
        auth.userId,
      ),
      env.DB.prepare(
        `DELETE FROM session WHERE user_id = ? AND session_token != ?`,
      ).bind(auth.userId, auth.sessionToken),
    ])

    logSecurityEvent({ type: 'password_changed', userId: auth.userId, email: auth.email })
    return { success: true }
  })

// ---------------------------------------------------------------------------
// T011: uploadPhotoServerFn
// ---------------------------------------------------------------------------

type UploadPhotoOutput =
  | { success: true; avatarDataUrl: string }
  | {
      success: false
      error: 'UNAUTHENTICATED' | 'INVALID_INPUT' | 'TOO_LARGE' | 'STORAGE_UNAVAILABLE'
    }

export const uploadPhotoServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: UploadPhotoInput) => d)
  .handler(async (ctx): Promise<UploadPhotoOutput> => {
    const env = ctx.context as unknown as Cloudflare.Env
    const { data } = ctx
    const auth = await requireSession(env)
    if (!auth) return { success: false, error: 'UNAUTHENTICATED' }

    if (data.mimeType !== 'image/jpeg' && data.mimeType !== 'image/png') {
      return { success: false, error: 'INVALID_INPUT' }
    }

    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0))
    if (bytes.length > 5_242_880) {
      return { success: false, error: 'TOO_LARGE' }
    }

    const key = `profile-photos/${auth.userId}`
    try {
      await env.PROFILE_PHOTOS.put(key, bytes, {
        httpMetadata: { contentType: data.mimeType },
      })
    } catch {
      return { success: false, error: 'STORAGE_UNAVAILABLE' }
    }

    const now = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE user_profile SET avatar_key = ?, updated_at = ? WHERE user_id = ?`,
    )
      .bind(key, now, auth.userId)
      .run()

    const avatarDataUrl = `data:${data.mimeType};base64,${data.base64}`
    return { success: true, avatarDataUrl }
  })

// ---------------------------------------------------------------------------
// T012: removePhotoServerFn
// ---------------------------------------------------------------------------

type RemovePhotoOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHENTICATED' | 'STORAGE_UNAVAILABLE' }

export const removePhotoServerFn = createServerFn({ method: 'POST' }).handler(
  async (ctx): Promise<RemovePhotoOutput> => {
    const env = ctx.context as unknown as Cloudflare.Env
    const auth = await requireSession(env)
    if (!auth) return { success: false, error: 'UNAUTHENTICATED' }

    const key = `profile-photos/${auth.userId}`
    try {
      await env.PROFILE_PHOTOS.delete(key)
    } catch {
      return { success: false, error: 'STORAGE_UNAVAILABLE' }
    }

    const now = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE user_profile SET avatar_key = NULL, updated_at = ? WHERE user_id = ?`,
    )
      .bind(now, auth.userId)
      .run()

    return { success: true }
  },
)
