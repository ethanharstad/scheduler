import { describe, it, expect } from 'vitest'
import { validateEmail, validatePasswordStrength } from './auth'

describe('validateEmail', () => {
  it('accepts standard email', () => {
    expect(validateEmail('user@example.com')).toBe(true)
  })

  it('accepts email with plus tag', () => {
    expect(validateEmail('user+tag@domain.co.uk')).toBe(true)
  })

  it('accepts email with leading/trailing whitespace (trimmed)', () => {
    expect(validateEmail('  user@domain.com  ')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(validateEmail('')).toBe(false)
  })

  it('rejects bare @', () => {
    expect(validateEmail('@')).toBe(false)
  })

  it('rejects missing local part', () => {
    expect(validateEmail('@domain.com')).toBe(false)
  })

  it('rejects missing domain', () => {
    expect(validateEmail('user@')).toBe(false)
  })
})

describe('validatePasswordStrength', () => {
  it('accepts 8+ chars with letter and digit', () => {
    expect(validatePasswordStrength('abcdef12')).toBe(true)
  })

  it('accepts complex password', () => {
    expect(validatePasswordStrength('Password123!')).toBe(true)
  })

  it('rejects password without digit', () => {
    expect(validatePasswordStrength('abcdefgh')).toBe(false)
  })

  it('rejects password without letter', () => {
    expect(validatePasswordStrength('12345678')).toBe(false)
  })

  it('rejects password shorter than 8 chars', () => {
    expect(validatePasswordStrength('abc123')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validatePasswordStrength('')).toBe(false)
  })
})
