import { describe, expect, it } from 'vitest'
import { isValidCallback } from '../src/validate-callback.js'

describe('validate-callback', () => {
  it('accepts 127.0.0.1 loopback', () => {
    expect(isValidCallback('http://127.0.0.1:8765/callback')).toBe(true)
  })

  it('rejects localhost by name (DNS can be overridden)', () => {
    expect(isValidCallback('http://localhost:54321/callback')).toBe(false)
  })

  it('accepts IPv6 loopback', () => {
    expect(isValidCallback('http://[::1]:8765/callback')).toBe(true)
  })

  it('rejects https', () => {
    expect(isValidCallback('https://127.0.0.1:8765/callback')).toBe(false)
  })

  it('rejects non-loopback host', () => {
    expect(isValidCallback('http://example.com:8765/callback')).toBe(false)
  })

  it('rejects public IP', () => {
    expect(isValidCallback('http://8.8.8.8:8765/callback')).toBe(false)
  })

  it('rejects port below 1024', () => {
    expect(isValidCallback('http://127.0.0.1:80/callback')).toBe(false)
  })

  it('rejects port above 65535', () => {
    expect(isValidCallback('http://127.0.0.1:70000/callback')).toBe(false)
  })

  it('rejects missing port', () => {
    expect(isValidCallback('http://127.0.0.1/callback')).toBe(false)
  })

  it('rejects wrong path', () => {
    expect(isValidCallback('http://127.0.0.1:8765/cb')).toBe(false)
    expect(isValidCallback('http://127.0.0.1:8765/callback/x')).toBe(false)
    expect(isValidCallback('http://127.0.0.1:8765/')).toBe(false)
  })

  it('rejects userinfo', () => {
    expect(isValidCallback('http://user:pass@127.0.0.1:8765/callback')).toBe(false)
  })

  it('rejects fragment', () => {
    expect(isValidCallback('http://127.0.0.1:8765/callback#frag')).toBe(false)
  })

  it('rejects pre-existing query', () => {
    expect(isValidCallback('http://127.0.0.1:8765/callback?x=1')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isValidCallback('not a url')).toBe(false)
    expect(isValidCallback('')).toBe(false)
  })
})
