import { describe, expect, it } from 'vitest'
import { buildRouteMatcher, patternToRegExp } from './route-matcher'

// These expectations mirror @clerk/shared's path-to-regexp behavior exactly (verified
// against @clerk/shared@3.47.6). Critically, `[orgSlug]` is LITERAL, not a wildcard —
// matching that prevents the /dashboard org-route redirect loop.
describe('clerk-fake route matcher', () => {
    it('compiles every proxy.ts pattern without throwing', () => {
        const patterns = [
            '/admin/safeinsights(.*)',
            '/[orgSlug]/admin/(.*)',
            '/[orgSlug]',
            '/researcher(.*)',
            '/(admin|dl|reviewer|researcher|organization)(.*)',
        ]
        expect(() => patterns.map(patternToRegExp)).not.toThrow()
    })

    it('treats [orgSlug] as literal text (does NOT match real paths)', () => {
        const m = buildRouteMatcher(['/[orgSlug]'])
        expect(m('/[orgSlug]')).toBe(true) // only the literal string
        expect(m('/dashboard')).toBe(false) // <- the loop-prevention case
        expect(m('/openstax')).toBe(false)
    })

    it('treats [orgSlug]/admin as literal too', () => {
        const m = buildRouteMatcher(['/[orgSlug]/admin/(.*)'])
        expect(m('/openstax/admin/team')).toBe(false)
        expect(m('/[orgSlug]/admin/team')).toBe(true)
        expect(m('/dashboard')).toBe(false)
    })

    it('matches SI admin routes', () => {
        const m = buildRouteMatcher(['/admin/safeinsights(.*)'])
        expect(m('/admin/safeinsights')).toBe(true)
        expect(m('/admin/safeinsights/users')).toBe(true)
        expect(m('/admin/other')).toBe(false)
    })

    it('matches researcher routes', () => {
        const m = buildRouteMatcher(['/researcher(.*)'])
        expect(m('/researcher')).toBe(true)
        expect(m('/researcher/studies')).toBe(true)
        expect(m('/dashboard')).toBe(false)
    })

    it('matches the alternation group route', () => {
        const m = buildRouteMatcher(['/(admin|dl|reviewer|researcher|organization)(.*)'])
        expect(m('/researcher/studies')).toBe(true)
        expect(m('/reviewer')).toBe(true)
        expect(m('/admin/safeinsights')).toBe(true)
        expect(m('/dashboard')).toBe(false)
    })
})
