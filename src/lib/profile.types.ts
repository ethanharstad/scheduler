/** D1 row shape for the `user_profile` table */
export interface UserProfile {
  user_id: string
  display_name: string
  phone_number: string | null
  avatar_key: string | null
  updated_at: string
}

/** Shape returned to the client from profile server functions */
export interface ProfileView {
  userId: string
  email: string
  displayName: string
  phoneNumber: string | null
  /** Data URL ("data:image/...;base64,...") when a photo is set, otherwise null */
  avatarDataUrl: string | null
}

/** Input for updateProfileServerFn */
export interface UpdateProfileInput {
  displayName: string
  phoneNumber: string | null
}

/** Input for changePasswordServerFn */
export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

/** Input for uploadPhotoServerFn */
export interface UploadPhotoInput {
  base64: string
  mimeType: 'image/jpeg' | 'image/png'
}
