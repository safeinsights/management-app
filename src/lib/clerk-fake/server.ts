// E2E Clerk fake, aliased in for `@clerk/nextjs/server` when E2E_FAKE_CLERK is set.
// Must stay edge-safe for clerkMiddleware/createRouteMatcher, since proxy.ts runs in the
// middleware runtime where next/headers is unavailable.

import { NextResponse, type NextRequest } from 'next/server'
import { readRoleCookieFromHeaders } from './cookie.server'
import { isFakeRole } from './fixtures'
import { buildV3Metadata, defaultOrgSlug, FAKE_ROLES, fixtureForRole, type FakeFixture } from './fixtures'
import { buildFakeUser, type FakeUser } from './user-resource'
import { resolveClerkId } from './resolve-clerk-id.server'
import { buildRouteMatcher } from './route-matcher'

export type User = FakeUser

type SessionClaims = {
    userMetadata: UserInfo
    unsafeMetadata: { currentOrgSlug?: string }
}

type AuthResult = {
    userId: string | null
    sessionClaims: SessionClaims | null
    orgSlug?: string
}

function buildAuthResult(fixture: FakeFixture | null, userId: string | null): AuthResult {
    if (!fixture || !userId) return { userId: null, sessionClaims: null }
    const orgSlug = defaultOrgSlug(fixture)
    return {
        userId,
        orgSlug,
        sessionClaims: {
            userMetadata: buildV3Metadata(fixture),
            unsafeMetadata: { currentOrgSlug: orgSlug },
        },
    }
}

export async function auth(): Promise<AuthResult> {
    const fixture = fixtureForRole(await readRoleCookieFromHeaders())
    if (!fixture) return { userId: null, sessionClaims: null }
    return buildAuthResult(fixture, await resolveClerkId(fixture))
}

export async function currentUser(): Promise<User | null> {
    const fixture = fixtureForRole(await readRoleCookieFromHeaders())
    if (!fixture) return null
    return { ...buildFakeUser(fixture), id: await resolveClerkId(fixture) }
}

// Used by the QA-cleanup routes under /api/*, which clerkMiddleware skips so auth() has no
// context. Returns the admin fixture's claims so a manual call still authorizes.
export async function verifyToken(_token: string, _options: unknown): Promise<{ sub: string } & SessionClaims> {
    const fixture = fixtureForRole('admin')!
    return {
        sub: await resolveClerkId(fixture),
        userMetadata: buildV3Metadata(fixture),
        unsafeMetadata: { currentOrgSlug: defaultOrgSlug(fixture) },
    }
}

const ALL_FIXTURES = FAKE_ROLES.map((role) => fixtureForRole(role)!)

// Matches either the deterministic fixture id or the real DB clerk_id, which forceUpdate
// paths pass in from auth().userId.
async function fixtureByClerkId(clerkId: string): Promise<FakeFixture | null> {
    const byFixture = ALL_FIXTURES.find((f) => f.clerkId === clerkId)
    if (byFixture) return byFixture
    for (const f of ALL_FIXTURES) {
        if ((await resolveClerkId(f)) === clerkId) return f
    }
    return null
}

const noop = async () => {}

function fakeClerkClient() {
    return {
        users: {
            getUser: async (clerkId: string) => {
                const fixture = (await fixtureByClerkId(clerkId)) ?? fixtureForRole('admin')!
                return { ...buildFakeUser(fixture), id: clerkId }
            },
            getUserList: async ({ emailAddress }: { emailAddress?: string[] } = {}) => {
                const email = emailAddress?.[0]
                const fixture = email
                    ? ALL_FIXTURES.find((f) => f.email.toLowerCase() === email.toLowerCase())
                    : undefined
                if (fixture) {
                    return { totalCount: 1, data: [buildFakeUser(fixture)] }
                }
                return { totalCount: 0, data: [] }
            },
            createUser: async ({ emailAddress }: { emailAddress?: string[] } = {}) => {
                const email = emailAddress?.[0] ?? 'fake-created@example.com'
                const id = `fake-created-${email}`
                return {
                    id,
                    emailAddresses: [{ id: `fake-email-${email}`, emailAddress: email }],
                    primaryEmailAddress: { emailAddress: email },
                }
            },
            updateUser: noop,
            updateUserMetadata: noop,
            deleteUser: noop,
            disableUserMFA: noop,
            getOrganizationMembershipList: async () => ({ data: [] }),
        },
        organizations: {
            getOrganization: async ({ slug }: { slug: string }) => ({ id: `fake-org-${slug}`, slug, name: slug }),
            createOrganization: async (org: Record<string, unknown>) => ({ id: 'fake-org-created', ...org }),
            createOrganizationMembership: async () => ({ id: 'fake-membership' }),
            updateOrganization: noop,
        },
        emailAddresses: {
            createEmailAddress: async ({ emailAddress }: { emailAddress: string }) => ({
                id: 'fake-email',
                emailAddress,
            }),
            updateEmailAddress: async (id: string) => ({ id, verified: true }),
        },
        phoneNumbers: {
            deletePhoneNumber: noop,
        },
    }
}

export async function clerkClient() {
    return fakeClerkClient()
}

type MiddlewareAuth = () => Promise<AuthResult>
type MiddlewareHandler = (auth: MiddlewareAuth, req: NextRequest) => Promise<NextResponse | void> | NextResponse | void

export function clerkMiddleware(handler: MiddlewareHandler) {
    return async (req: NextRequest): Promise<NextResponse> => {
        const rawCookie = req.cookies.get('__e2e_role')?.value
        const fixture = fixtureForRole(isFakeRole(rawCookie) ? rawCookie : null)
        // Edge-safe: no DB read here, so the fallback clerkId is only used for proxy logging.
        const result = buildAuthResult(fixture, fixture?.clerkId ?? null)
        const authFn: MiddlewareAuth = async () => result
        const out = await handler(authFn, req)
        return out instanceof NextResponse ? out : NextResponse.next()
    }
}

export function createRouteMatcher(patterns: string[]) {
    const match = buildRouteMatcher(patterns)
    return (req: NextRequest): boolean => match(req.nextUrl.pathname)
}
