import { describe, expect, it } from '@/tests/unit.helpers'
import type { Route } from 'next'
import { safeRedirectUrl } from './utils'

const FALLBACK = '/' as Route

describe('safeRedirectUrl', () => {
    it('returns fallback for null, undefined, and empty string', () => {
        expect(safeRedirectUrl(null, FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl(undefined, FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('', FALLBACK)).toBe(FALLBACK)
    })

    it('accepts valid relative paths', () => {
        expect(safeRedirectUrl('/dashboard', FALLBACK)).toBe('/dashboard')
        expect(safeRedirectUrl('/org/study/123/view', FALLBACK)).toBe('/org/study/123/view')
    })

    it('accepts paths with query strings and fragments', () => {
        expect(safeRedirectUrl('/dashboard?tab=settings', FALLBACK)).toBe('/dashboard?tab=settings')
        expect(safeRedirectUrl('/page#section', FALLBACK)).toBe('/page#section')
    })

    it('rejects protocol-relative URLs', () => {
        expect(safeRedirectUrl('//evil.com', FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('//evil.com/path', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects absolute URLs with schemes', () => {
        expect(safeRedirectUrl('https://evil.com', FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('http://evil.com', FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('ftp://evil.com', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects javascript: URIs', () => {
        expect(safeRedirectUrl('javascript:alert(1)', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects data: URIs', () => {
        expect(safeRedirectUrl('data:text/html,<h1>hi</h1>', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects path traversal with ..', () => {
        expect(safeRedirectUrl('/foo/../etc/passwd', FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('/..', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects encoded path traversal (%2e%2e)', () => {
        expect(safeRedirectUrl('/foo/%2e%2e/etc/passwd', FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('/%2e%2e', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects double-encoded path traversal (%252e)', () => {
        expect(safeRedirectUrl('/foo/%252e%252e/etc/passwd', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects backslashes', () => {
        expect(safeRedirectUrl('/foo\\bar', FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('/%5c', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects null bytes', () => {
        expect(safeRedirectUrl('/foo%00bar', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects encoded control characters', () => {
        expect(safeRedirectUrl('/%0d%0a%0d%0a<script>alert(1)</script>', FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('/foo%09bar', FALLBACK)).toBe(FALLBACK)
    })

    it('returns fallback for malformed percent-encoding', () => {
        expect(safeRedirectUrl('/foo%ZZ', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects URLs not starting with /', () => {
        expect(safeRedirectUrl('evil.com', FALLBACK)).toBe(FALLBACK)
        expect(safeRedirectUrl('relative/path', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects encoded double slashes', () => {
        expect(safeRedirectUrl('/%2f%2fevil.com', FALLBACK)).toBe(FALLBACK)
    })
})
