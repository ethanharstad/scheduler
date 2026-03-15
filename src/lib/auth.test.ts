import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generateToken } from './auth'

describe('hashPassword + verifyPassword', () => {
  it('round-trip: correct password verifies', async () => {
    const hash = await hashPassword('TestPass123')
    expect(await verifyPassword('TestPass123', hash)).toBe(true)
  })

  it('wrong password returns false', async () => {
    const hash = await hashPassword('TestPass123')
    expect(await verifyPassword('WrongPass456', hash)).toBe(false)
  })

  it('different hashes for same password (random salt)', async () => {
    const h1 = await hashPassword('TestPass123')
    const h2 = await hashPassword('TestPass123')
    expect(h1).not.toBe(h2)
  })

  it('malformed stored hash returns false', async () => {
    expect(await verifyPassword('anything', 'not-base64!!!')).toBe(false)
  })

  it('truncated stored hash returns false', async () => {
    // Valid base64 but decodes to < 64 bytes
    expect(await verifyPassword('anything', btoa('short'))).toBe(false)
  })

  it('hash decodes to 64 bytes', async () => {
    const hash = await hashPassword('TestPass123')
    const decoded = Uint8Array.from(atob(hash), c => c.charCodeAt(0))
    expect(decoded.length).toBe(64)
  })
})

describe('generateToken', () => {
  it('contains only base64url characters', () => {
    const token = generateToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('two calls produce different tokens', () => {
    const t1 = generateToken()
    const t2 = generateToken()
    expect(t1).not.toBe(t2)
  })

  it('has expected length (~43 chars for 32 bytes)', () => {
    const token = generateToken()
    // 32 bytes → 43 base64url chars (no padding)
    expect(token.length).toBe(43)
  })
})
