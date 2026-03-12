import { describe, expect, it } from 'vitest'
import { isValidUrl } from './config'

describe('isValidUrl', () => {
    it('accepts valid http URLs', () => {
        expect(isValidUrl('http://example.com')).toBe(true)
        expect(isValidUrl('http://example.com/path?q=1')).toBe(true)
    })

    it('accepts valid https URLs', () => {
        expect(isValidUrl('https://example.com')).toBe(true)
        expect(isValidUrl('https://sub.example.com/path#hash')).toBe(true)
    })

    it('rejects javascript: protocol', () => {
        expect(isValidUrl('javascript:alert(1)')).toBe(false)
    })

    it('rejects data: protocol', () => {
        expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    })

    it('rejects mailto: protocol', () => {
        expect(isValidUrl('mailto:user@example.com')).toBe(false)
    })

    it('rejects URLs without a TLD', () => {
        expect(isValidUrl('https://localhost')).toBe(false)
        expect(isValidUrl('http://intranet')).toBe(false)
    })

    it('rejects non-URL strings', () => {
        expect(isValidUrl('not a url')).toBe(false)
        expect(isValidUrl('')).toBe(false)
    })
})
