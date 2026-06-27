// E2E Clerk fake — role fixtures.
//
// This module mirrors the DB seed in src/database/seeds/1743608138837_test_users.ts.
// The fake auth()/useUser() present one of these identities based on the __e2e_role
// cookie, building v3 session metadata WITHOUT a DB round-trip so marshalSession
// short-circuits and no Clerk network is ever hit.
//
// If the seed changes (UUIDs, org memberships, emails), update this table to match.

export type FakeRole = 'admin' | 'researcher' | 'reviewer'

export type FakeOrg = {
    id: string
    slug: string
    type: 'enclave' | 'lab'
    isAdmin: boolean
}

export type FakeFixture = {
    role: FakeRole
    /** DB `user.id` (and v3 metadata user.id) — fixed UUID from the seed. */
    userId: string
    /** DB `user.clerkId` — the value the seed inserts. */
    clerkId: string
    email: string
    firstName: string
    lastName: string
    orgs: Record<string, FakeOrg>
}

const ORG = {
    safeInsights: { id: '00000000-0000-4000-8000-000000000101', slug: 'safe-insights', type: 'enclave' } as const,
    openstax: { id: '00000000-0000-4000-8000-000000000103', slug: 'openstax', type: 'enclave' } as const,
    openstaxLab: { id: '00000000-0000-4000-8000-000000000104', slug: 'openstax-lab', type: 'lab' } as const,
    reviewerIsOrgAdmin: {
        id: '00000000-0000-4000-8000-000000000106',
        slug: 'reviewer-is-org-admin',
        type: 'enclave',
    } as const,
}

const org = (base: { id: string; slug: string; type: 'enclave' | 'lab' }, isAdmin: boolean): FakeOrg => ({
    ...base,
    isAdmin,
})

export const ROLE_FIXTURES: Record<FakeRole, FakeFixture> = {
    admin: {
        role: 'admin',
        userId: '00000000-0000-4000-8000-000000000001',
        clerkId: 'test-clerk-admin',
        email: 'si-adm-tester-dbfyq3@mailinator.com',
        firstName: 'Test Admin',
        lastName: 'User',
        orgs: {
            'safe-insights': org(ORG.safeInsights, true),
            openstax: org(ORG.openstax, true),
            'openstax-lab': org(ORG.openstaxLab, true),
        },
    },
    researcher: {
        role: 'researcher',
        userId: '00000000-0000-4000-8000-000000000002',
        clerkId: 'test-clerk-researcher',
        email: 'si-research-tester-dbfyq3@mailinator.com',
        firstName: 'Test Researcher',
        lastName: 'User',
        orgs: {
            'openstax-lab': org(ORG.openstaxLab, false),
        },
    },
    reviewer: {
        role: 'reviewer',
        userId: '00000000-0000-4000-8000-000000000003',
        clerkId: 'test-clerk-reviewer',
        email: 'si-member-tester-dbfyq3@mailinator.com',
        firstName: 'Test Reviewer',
        lastName: 'User',
        orgs: {
            openstax: org(ORG.openstax, false),
            'reviewer-is-org-admin': org(ORG.reviewerIsOrgAdmin, true),
        },
    },
}

export const FAKE_ROLES = Object.keys(ROLE_FIXTURES) as FakeRole[]

export function isFakeRole(value: string | undefined | null): value is FakeRole {
    return value === 'admin' || value === 'researcher' || value === 'reviewer'
}

export function fixtureForRole(role: string | undefined | null): FakeFixture | null {
    return isFakeRole(role) ? ROLE_FIXTURES[role] : null
}

export function fixtureForEmail(email: string | undefined | null): FakeFixture | null {
    if (!email) return null
    const lower = email.toLowerCase()
    return FAKE_ROLES.map((r) => ROLE_FIXTURES[r]).find((f) => f.email.toLowerCase() === lower) ?? null
}

// Builds the v3 UserInfo metadata that marshalSession short-circuits on. The shape
// is identical to what tests/unit.helpers.tsx mockClerkSession() produces and to what
// src/server/clerk.ts calculateUserPublicMetadata() builds for a real user.
export function buildV3Metadata(fixture: FakeFixture): UserInfo {
    return {
        format: 'v3',
        user: { id: fixture.userId },
        teams: null,
        orgs: Object.fromEntries(
            Object.entries(fixture.orgs).map(([slug, o]) => [
                slug,
                { id: o.id, slug: o.slug, type: o.type, isAdmin: o.isAdmin },
            ]),
        ),
    }
}

// The org slug the fake reports as "current" when none is derivable from the request
// path. Used to populate unsafeMetadata.currentOrgSlug.
export function defaultOrgSlug(fixture: FakeFixture): string {
    return Object.keys(fixture.orgs)[0]
}
