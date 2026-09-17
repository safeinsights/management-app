import { describe, it, expect } from '@/tests/unit.helpers'
import { formatCategoryLine, internalPathname } from './link-preview'

const ORIGIN = 'https://app.qa.safeinsights.org'

describe('internalPathname', () => {
    it('returns the pathname of a link to this app', () => {
        expect(internalPathname(`${ORIGIN}/openstax-lab/study/abc/view?returnTo=org`, ORIGIN)).toBe(
            '/openstax-lab/study/abc/view',
        )
    })

    it('drops the hash as well as the query', () => {
        expect(internalPathname(`${ORIGIN}/dashboard#section`, ORIGIN)).toBe('/dashboard')
    })

    it('returns null for another origin', () => {
        expect(internalPathname('https://example.com/dashboard', ORIGIN)).toBeNull()
        expect(internalPathname('https://app.staging.safeinsights.org/dashboard', ORIGIN)).toBeNull()
    })

    it('returns null for a non-URL and for a scheme that is not http', () => {
        expect(internalPathname('not a url', ORIGIN)).toBeNull()
        expect(internalPathname('javascript:alert(1)', ORIGIN)).toBeNull()
    })

    it('returns null for a relative href, which the editor never stores', () => {
        expect(internalPathname('/dashboard', ORIGIN)).toBeNull()
    })

    it('returns null when the origin is unknown, as it is during server rendering', () => {
        expect(internalPathname(`${ORIGIN}/dashboard`, '')).toBeNull()
    })
})

describe('formatCategoryLine', () => {
    it('joins the app name and the category with a middle dot', () => {
        expect(formatCategoryLine('OpenStax')).toBe('SafeInsights · OpenStax')
    })

    it('falls back to the app name alone', () => {
        expect(formatCategoryLine(null)).toBe('SafeInsights')
    })
})
