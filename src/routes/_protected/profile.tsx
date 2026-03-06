import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { User, Phone, Mail, Lock, Camera, X } from 'lucide-react'
import { getProfileServerFn } from '@/server/profile'
import { updateProfileServerFn } from '@/server/profile'
import { changePasswordServerFn } from '@/server/profile'
import { uploadPhotoServerFn } from '@/server/profile'
import { removePhotoServerFn } from '@/server/profile'
import type { ProfileView } from '@/lib/profile.types'

export const Route = createFileRoute('/_protected/profile')({
  head: () => ({
    meta: [{ title: 'Profile | Scene Ready' }],
  }),
  loader: async () => {
    const result = await getProfileServerFn()
    if (!result.success) {
      throw redirect({
        to: '/login',
        search: { from: '/profile', verified: false, reset: false },
      })
    }
    return result.profile
  },
  component: ProfilePage,
})

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function ProfilePage() {
  const profile = Route.useLoaderData()
  const router = useRouter()

  const [currentProfile, setCurrentProfile] = useState<ProfileView>(profile)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-navy-700">Your Profile</h1>

      <AvatarSection
        profile={currentProfile}
        onUpdate={(updated) => setCurrentProfile(updated)}
      />
      <ProfileInfoSection
        profile={currentProfile}
        onUpdate={(updated) => setCurrentProfile(updated)}
      />
      <ChangePasswordSection onSuccess={() => void router.navigate({ to: '/login', search: { from: '/home', verified: false, reset: true } })} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Avatar section
// ---------------------------------------------------------------------------

function AvatarSection({
  profile,
  onUpdate,
}: {
  profile: ProfileView
  onUpdate: (p: ProfileView) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError(null)

    const mimeType = file.type as 'image/jpeg' | 'image/png'
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      setPhotoError('Only JPEG and PNG images are supported.')
      return
    }

    setUploading(true)
    try {
      const base64 = await readFileAsBase64(file)
      const result = await uploadPhotoServerFn({ data: { base64, mimeType } })
      if (result.success) {
        onUpdate({ ...profile, avatarDataUrl: result.avatarDataUrl })
      } else if (result.error === 'TOO_LARGE') {
        setPhotoError('Image must be under 5 MB.')
      } else if (result.error === 'STORAGE_UNAVAILABLE') {
        setPhotoError('Photo storage is temporarily unavailable. Other profile settings still work.')
      } else {
        setPhotoError('Invalid image file.')
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemove() {
    setPhotoError(null)
    setUploading(true)
    try {
      const result = await removePhotoServerFn()
      if (result.success) {
        onUpdate({ ...profile, avatarDataUrl: null })
      } else {
        setPhotoError('Photo storage is temporarily unavailable. Other profile settings still work.')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-navy-700 mb-4">Profile Photo</h2>
      <div className="flex items-center gap-6">
        <div className="relative">
          {profile.avatarDataUrl ? (
            <img
              src={profile.avatarDataUrl}
              alt="Profile photo"
              className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200">
              <User className="w-8 h-8 text-gray-400" />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <span className="text-white text-xs">…</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
          >
            <Camera className="w-4 h-4" />
            {profile.avatarDataUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {profile.avatarDataUrl && (
            <button
              onClick={() => void handleRemove()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Remove photo
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
      </div>
      {photoError && (
        <p className="mt-3 text-sm text-danger">{photoError}</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Profile info section
// ---------------------------------------------------------------------------

function ProfileInfoSection({
  profile,
  onUpdate,
}: {
  profile: ProfileView
  onUpdate: (p: ProfileView) => void
}) {
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? '')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ displayName?: string; phoneNumber?: string }>({})
  const [success, setSuccess] = useState(false)

  function handleEdit() {
    setDisplayName(profile.displayName)
    setPhoneNumber(profile.phoneNumber ?? '')
    setErrors({})
    setSuccess(false)
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setErrors({})
  }

  async function handleSave() {
    setErrors({})
    setSuccess(false)
    setSaving(true)
    try {
      const result = await updateProfileServerFn({
        data: {
          displayName,
          phoneNumber: phoneNumber.trim() || null,
        },
      })
      if (result.success) {
        onUpdate(result.profile)
        setEditing(false)
        setSuccess(true)
      } else if (result.field === 'displayName') {
        setErrors({ displayName: 'Display name is required and must be under 100 characters.' })
      } else if (result.field === 'phoneNumber') {
        setErrors({ phoneNumber: 'Enter a valid international phone number (e.g. +1 555 000 1234).' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-navy-700">Personal Information</h2>
        {!editing && (
          <button
            onClick={handleEdit}
            className="text-sm text-red-700 hover:text-red-800 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {success && !editing && (
        <div className="mb-4 px-4 py-2 bg-success-bg border border-success/30 rounded-lg text-success text-sm">
          Profile updated successfully.
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1">
            <User className="w-4 h-4" />
            Display name
          </label>
          {editing ? (
            <>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
                maxLength={100}
              />
              {errors.displayName && (
                <p className="mt-1 text-xs text-danger">{errors.displayName}</p>
              )}
            </>
          ) : (
            <p className="text-gray-900">{profile.displayName}</p>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1">
            <Mail className="w-4 h-4" />
            Email address
            <span className="text-xs text-gray-400">(read-only)</span>
          </label>
          <p className="text-gray-900">{profile.email}</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1">
            <Phone className="w-4 h-4" />
            Phone number
          </label>
          {editing ? (
            <>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. +1 555 000 1234"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
              />
              {errors.phoneNumber && (
                <p className="mt-1 text-xs text-danger">{errors.phoneNumber}</p>
              )}
            </>
          ) : (
            <p className="text-gray-900">{profile.phoneNumber ?? <span className="text-gray-400">Not provided</span>}</p>
          )}
        </div>
      </div>

      {editing && (
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Change password section
// ---------------------------------------------------------------------------

function ChangePasswordSection({ onSuccess }: { onSuccess: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{
    currentPassword?: string
    newPassword?: string
    confirmPassword?: string
  }>({})
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match.' })
      return
    }

    setSaving(true)
    try {
      const result = await changePasswordServerFn({
        data: { currentPassword, newPassword },
      })
      if (result.success) {
        setSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(onSuccess, 2000)
      } else if (result.error === 'WRONG_PASSWORD') {
        setErrors({ currentPassword: 'Current password is incorrect.' })
      } else if (result.error === 'INVALID_INPUT') {
        setErrors({ newPassword: 'Password must be at least 8 characters and include a letter and a number.' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-navy-700 mb-4 flex items-center gap-2">
        <Lock className="w-5 h-5" />
        Change Password
      </h2>

      {success && (
        <div className="mb-4 px-4 py-2 bg-success-bg border border-success/30 rounded-lg text-success text-sm">
          Password changed successfully. Other sessions have been signed out. Redirecting…
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
          />
          {errors.currentPassword && (
            <p className="mt-1 text-xs text-danger">{errors.currentPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
          />
          {errors.newPassword && (
            <p className="mt-1 text-xs text-danger">{errors.newPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-danger">{errors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
        >
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
