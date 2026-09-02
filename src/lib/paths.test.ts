import { describe, expect, it } from '@/tests/unit.helpers'
import { extractOrgSlugFromPath } from '@/lib/paths'
import { Routes } from '@/lib/routes'

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
        ['/legal', null],
        ['/user-key', null],
        ['/', null],
        ['/acme', 'acme'],
        ['/acme/dashboard', 'acme'],
        ['/acme/admin/team', 'acme'],
    ])('%s -> %j', (pathname, expected) => {
        expect(extractOrgSlugFromPath(pathname)).toBe(expected)
    })

    // Adding a top-level route without adding its prefix here makes the page unreachable, which is
    // how /legal shipped broken. Parameterised routes are functions, so only the flat ones apply.
    // Cast, not a type predicate: Routes values are Next's branded Route type, not plain strings.
    const flatRoutes = Object.values(Routes).filter((route) => typeof route === 'string') as string[]

    it.each(flatRoutes.filter((route) => route.split('/')[1]))('reserves %s', (route) => {
        expect(extractOrgSlugFromPath(route)).toBeNull()
    })
})
