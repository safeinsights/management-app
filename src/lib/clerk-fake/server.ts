// E2E Clerk fake — server shim.
//
// Aliased in for `@clerk/nextjs/server` when E2E_FAKE_CLERK is set (see next.config.ts).
// Provides auth/currentUser/clerkClient/clerkMiddleware/createRouteMatcher with the
// minimal surface the app consumes, sourced from the __e2e_role cookie + fixtures so
// no Clerk network is ever hit.
//
// IMPORTANT: this module must stay edge-safe for clerkMiddleware/createRouteMatcher
// (proxy.ts runs in the middleware runtime). auth()/currentUser() are only called from
// the Node server-component/action runtime, where next/headers is available.

import { NextResponse, type NextRequest } from 'next/server'
import { readRoleCookieFromHeaders } from './cookie.server'
import { isFakeRole } from './fixtures'
import { buildV3Metadata, defaultOrgSlug, fixtureForRole, type FakeFixture } from './fixtures'
import { buildFakeUser, type FakeUser } from './user-resource'
import { resolveClerkId } from './resolve-clerk-id.server'
import { buildRouteMatcher } from './route-matcher'

// The shim's exported User type stands in for @clerk/nextjs/server's `User`.
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

// Builds the AuthResult given an already-resolved userId (clerkId). marshalSession's
// short-circuit keys off sessionClaims.userMetadata.user.id (the UUID), so userId here
// only needs to be a stable identifier; for currentUser-backed code paths it must match
// the DB clerk_id, which the caller resolves.
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

// Server-component / server-action entrypoint. Mirrors @clerk/nextjs/server `auth()`.
export async function auth(): Promise<AuthResult> {
    const fixture = fixtureForRole(await readRoleCookieFromHeaders())
    if (!fixture) return { userId: null, sessionClaims: null }
    return buildAuthResult(fixture, await resolveClerkId(fixture))
}

// Mirrors @clerk/nextjs/server `currentUser()`.
export async function currentUser(): Promise<User | null> {
    const fixture = fixtureForRole(await readRoleCookieFromHeaders())
    if (!fixture) return null
    return { ...buildFakeUser(fixture), id: await resolveClerkId(fixture) }
}

// --- clerkClient (backend API) -------------------------------------------------
//
// Mirrors the subset of methods tests/unit.helpers.tsx mockClerkSession() stubs.
// All reads resolve from fixtures; all writes are no-ops. This keeps the forceUpdate
// paths (onUserSignInAction/syncUserMetadataAction) network-free.

const ALL_FIXTURES = (['admin', 'researcher', 'reviewer'] as const).map((r) => fixtureForRole(r)!)

// Resolve a fixture from a clerkId, matching either the deterministic fixture id or the
// real DB clerk_id (which forceUpdate paths pass in, sourced from auth().userId).
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

// --- clerkMiddleware / createRouteMatcher --------------------------------------
//
// Reimplemented edge-safe. clerkMiddleware passes an auth() to the handler that reads
// the request cookie directly (next/headers is awkward in middleware). createRouteMatcher
// compiles the glob patterns proxy.ts uses (see ./route-matcher).

type MiddlewareAuth = () => Promise<AuthResult>
type MiddlewareHandler = (auth: MiddlewareAuth, req: NextRequest) => Promise<NextResponse | void> | NextResponse | void

export function clerkMiddleware(handler: MiddlewareHandler) {
    return async (req: NextRequest): Promise<NextResponse> => {
        // req.cookies.get() returns the bare value, not a Cookie header — match the role
        // directly rather than parsing a header string.
        const rawCookie = req.cookies.get('__e2e_role')?.value
        const fixture = fixtureForRole(isFakeRole(rawCookie) ? rawCookie : null)
        // Edge-safe: no DB read here. marshalSession short-circuits on the UUID in
        // userMetadata; the fallback clerkId is only used for proxy logging.
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
