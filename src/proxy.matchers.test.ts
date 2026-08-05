import { describe, expect, it, vi } from '@/tests/unit.helpers'
import { NextRequest } from 'next/server'

// vitest.setup.ts auto-mocks @clerk/nextjs/server, so pull in the real implementation: the whole
// point of this suite is to exercise Clerk's actual path-to-regexp compilation, not a stub.
const realCreateRouteMatcher = async () => {
    const actual = await vi.importActual<typeof import('@clerk/nextjs/server')>('@clerk/nextjs/server')
    return actual.createRouteMatcher
}

const req = (path: string) => new NextRequest(`https://app.test${path}`)

describe('org admin route matcher', () => {
    it('matches org admin paths using the colon syntax the proxy ships', async () => {
        const createRouteMatcher = await realCreateRouteMatcher()
        const isOrgAdminRoute = createRouteMatcher(['/:orgSlug/admin/(.*)'])

        expect(isOrgAdminRoute(req('/acme/admin/team'))).toBe(true)
        expect(isOrgAdminRoute(req('/acme/admin/settings'))).toBe(true)
    })

    it('does not match non-admin or non-org paths', async () => {
        const createRouteMatcher = await realCreateRouteMatcher()
        const isOrgAdminRoute = createRouteMatcher(['/:orgSlug/admin/(.*)'])

        expect(isOrgAdminRoute(req('/acme'))).toBe(false)
        expect(isOrgAdminRoute(req('/acme/dashboard'))).toBe(false)
        expect(isOrgAdminRoute(req('/dashboard'))).toBe(false)
        expect(isOrgAdminRoute(req('/admin/safeinsights'))).toBe(false)
        expect(isOrgAdminRoute(req('/researcher/x'))).toBe(false)
    })

    // Regression guard for MA-11: the Next.js filesystem `[param]` convention is NOT path-to-regexp
    // syntax. Clerk's bundled fork treats the brackets as literal characters and silently matches
    // nothing rather than throwing, so this dead guard is invisible without an explicit assertion.
    it('confirms the bracket convention matches nothing, which is why it must never come back', async () => {
        const createRouteMatcher = await realCreateRouteMatcher()
        const bracketMatcher = createRouteMatcher(['/[orgSlug]/admin/(.*)'])

        expect(bracketMatcher(req('/acme/admin/team'))).toBe(false)
        expect(bracketMatcher(req('/acme/admin/settings'))).toBe(false)
    })

    it('leaves the literal si-admin and researcher matchers matching their own subtrees', async () => {
        const createRouteMatcher = await realCreateRouteMatcher()
        const isSIAdminRoute = createRouteMatcher(['/admin/safeinsights(.*)'])
        const isResearcherRoute = createRouteMatcher(['/researcher(.*)'])

        expect(isSIAdminRoute(req('/admin/safeinsights'))).toBe(true)
        expect(isSIAdminRoute(req('/admin/safeinsights/orgs'))).toBe(true)
        expect(isSIAdminRoute(req('/acme/admin/team'))).toBe(false)

        expect(isResearcherRoute(req('/researcher/x'))).toBe(true)
        expect(isResearcherRoute(req('/acme/dashboard'))).toBe(false)
    })

    // A `/:orgSlug` matcher looks like the natural org-membership guard but a single colon segment
    // also captures every top-level route, so the proxy gates on extractOrgSlugFromPath instead.
    it('shows why a bare /:orgSlug matcher cannot gate org membership', async () => {
        const createRouteMatcher = await realCreateRouteMatcher()
        const bareOrgMatcher = createRouteMatcher(['/:orgSlug'])

        expect(bareOrgMatcher(req('/acme'))).toBe(true)
        expect(bareOrgMatcher(req('/dashboard'))).toBe(true)
        expect(bareOrgMatcher(req('/about'))).toBe(true)
    })
})
