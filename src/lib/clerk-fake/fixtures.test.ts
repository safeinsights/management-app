import { describe, expect, it } from 'vitest'
import { sessionFromMetadata } from '@/lib/session'
import { isOrgAdmin } from '@/lib/types'
import { buildV3Metadata, fixtureForEmail, fixtureForRole, isFakeRole, ROLE_FIXTURES, type FakeRole } from './fixtures'
import { parseRoleCookie, E2E_ROLE_COOKIE } from './cookie'

describe('clerk-fake fixtures', () => {
    it('builds v3 metadata that sessionFromMetadata accepts for every role', () => {
        for (const role of Object.keys(ROLE_FIXTURES) as FakeRole[]) {
            const fixture = ROLE_FIXTURES[role]
            const metadata = buildV3Metadata(fixture)

            expect(metadata.format).toBe('v3')
            expect(metadata.user.id).toBe(fixture.userId)
            expect(metadata.teams).toBeNull()

            const session = sessionFromMetadata({
                metadata: metadata as unknown as UserPublicMetadata,
                prefs: {},
                clerkUserId: fixture.clerkId,
            })

            expect(session.user.id).toBe(fixture.userId)
            expect(session.user.clerkUserId).toBe(fixture.clerkId)
            expect(Object.keys(session.orgs).sort()).toEqual(Object.keys(fixture.orgs).sort())
        }
    })

    it('grants isSiAdmin only to the admin fixture (safe-insights admin)', () => {
        const admin = sessionFromMetadata({
            metadata: buildV3Metadata(ROLE_FIXTURES.admin) as unknown as UserPublicMetadata,
            prefs: {},
            clerkUserId: 'test-clerk-admin',
        })
        expect(admin.user.isSiAdmin).toBe(true)

        for (const role of ['researcher', 'reviewer'] as const) {
            const session = sessionFromMetadata({
                metadata: buildV3Metadata(ROLE_FIXTURES[role]) as unknown as UserPublicMetadata,
                prefs: {},
                clerkUserId: ROLE_FIXTURES[role].clerkId,
            })
            expect(session.user.isSiAdmin).toBe(false)
        }
    })

    it('preserves per-org admin flags from the seed (reviewer is admin of reviewer-is-org-admin)', () => {
        const reviewer = sessionFromMetadata({
            metadata: buildV3Metadata(ROLE_FIXTURES.reviewer) as unknown as UserPublicMetadata,
            prefs: {},
            clerkUserId: 'test-clerk-reviewer',
        })
        expect(isOrgAdmin(reviewer.orgs['reviewer-is-org-admin'])).toBe(true)
        expect(isOrgAdmin(reviewer.orgs['openstax'])).toBe(false)
    })

    it('resolves fixtures by role and email', () => {
        expect(fixtureForRole('admin')).toBe(ROLE_FIXTURES.admin)
        expect(fixtureForRole('nope')).toBeNull()
        expect(fixtureForEmail(ROLE_FIXTURES.researcher.email.toUpperCase())).toBe(ROLE_FIXTURES.researcher)
        expect(fixtureForEmail('unknown@example.com')).toBeNull()
    })

    it('validates role names', () => {
        expect(isFakeRole('reviewer')).toBe(true)
        expect(isFakeRole('superuser')).toBe(false)
        expect(isFakeRole(undefined)).toBe(false)
    })
})

describe('clerk-fake cookie parsing', () => {
    it('extracts the role from a cookie header among others', () => {
        expect(parseRoleCookie(`foo=bar; ${E2E_ROLE_COOKIE}=admin; baz=qux`)).toBe('admin')
    })

    it('returns null for missing or invalid roles', () => {
        expect(parseRoleCookie('foo=bar')).toBeNull()
        expect(parseRoleCookie(`${E2E_ROLE_COOKIE}=root`)).toBeNull()
        expect(parseRoleCookie(undefined)).toBeNull()
    })
})
