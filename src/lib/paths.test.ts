import { describe, expect, it } from '@/tests/unit.helpers'
import { extractOrgSlugFromPath } from '@/lib/paths'

describe('extractOrgSlugFromPath', () => {
    // The proxy's org-membership guard trusts this: a reserved page misclassified as a slug
    // becomes unreachable.
    it.each([
        ['/404', null],
        ['/dashboard', null],
        ['/editor-demo', null],
        ['/about', null],
        ['/account/signin', null],
        ['/admin/safeinsights', null],
        ['/researcher/studies', null],
        ['/', null],
        ['/acme', 'acme'],
        ['/acme/dashboard', 'acme'],
        ['/acme/admin/team', 'acme'],
    ])('%s -> %j', (pathname, expected) => {
        expect(extractOrgSlugFromPath(pathname)).toBe(expected)
    })
})
