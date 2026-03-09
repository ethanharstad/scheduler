/** D1 row shape for the `user` table */
export interface User {
  id: string
  email: string
  password_hash: string
  verified: 0 | 1
  failed_attempts: number
  lock_until: string | null
  is_system_admin: 0 | 1
  created_at: string
}

/** D1 row shape for the `session` table */
export interface Session {
  id: string
  user_id: string
  session_token: string
  created_at: string
  last_activity_at: string
  expires_at: string
}

/** D1 row shape for the `email_verification_token` table */
export interface EmailVerificationToken {
  id: string
  user_id: string
  token: string
  created_at: string
  expires_at: string
  used: 0 | 1
}

/** D1 row shape for the `password_reset_token` table */
export interface PasswordResetToken {
  id: string
  user_id: string
  token: string
  created_at: string
  expires_at: string
  used: 0 | 1
}

/** Shape returned to routes after successful session validation */
export interface SessionContext {
  userId: string
  email: string
  displayName: string
  isSystemAdmin: boolean
}
