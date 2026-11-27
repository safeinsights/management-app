'use client'

// E2E Clerk fake, aliased in for `@clerk/nextjs` when E2E_FAKE_CLERK is set. The 'use client'
// directive MUST stay at the top so Next registers the client boundary through the alias.
// Hook returns are memoized: a new object every render makes effects keyed on user/session/auth
// throw "Maximum update depth exceeded".

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { clearRoleCookieFromDocument, writeRoleCookieToDocument } from './cookie'
import { defaultOrgSlug } from './fixtures'
import { buildFakeUser } from './user-resource'
import { fakeSignIn, type FakeSignIn } from './sign-in-resource'
import { getFixture, getServerFixture, LOADING, notifyAuthChanged, subscribe, type FixtureState } from './store'

function useFixtureState(): FixtureState {
    return useSyncExternalStore(subscribe, getFixture, getServerFixture)
}

// Stable across renders and recent enough that the inactivity watcher in activity-context
// never trips during tests.
const SESSION_ACTIVE_AT = new Date()

// Real Clerk's ClerkProvider refreshes the router after finalize and signOut, so server components
// such as the root layout re-render for the new session.
function useAuthChanged() {
    const router = useRouter()
    return useCallback(() => {
        notifyAuthChanged()
        router.refresh()
    }, [router])
}

function useSignOut() {
    const authChanged = useAuthChanged()
    return useCallback(async () => {
        clearRoleCookieFromDocument()
        authChanged()
    }, [authChanged])
}

export function ClerkProvider({
    children,
}: {
    children: ReactNode
    publishableKey?: string
    nonce?: string
    dynamic?: boolean
}) {
    useEffect(() => {
        // Re-sync from the cookie so consumers that rendered signed-out during SSR flip
        // to the real role.
        notifyAuthChanged()
    }, [])
    return <>{children}</>
}

export function useUser() {
    const state = useFixtureState()
    return useMemo(() => {
        if (state === LOADING) return { isLoaded: false, isSignedIn: undefined, user: undefined }
        if (!state) return { isLoaded: true, isSignedIn: false, user: null }
        return { isLoaded: true, isSignedIn: true, user: buildFakeUser(state) }
    }, [state])
}

export function useAuth() {
    const state = useFixtureState()
    const signOut = useSignOut()
    const getToken = useCallback(async () => 'e2e-fake-token', [])
    return useMemo(() => {
        const fixture = state === LOADING ? null : state
        return {
            isLoaded: state !== LOADING,
            isSignedIn: state === LOADING ? undefined : Boolean(fixture),
            userId: fixture?.clerkId ?? null,
            sessionId: fixture ? `e2e-session-${fixture.role}` : null,
            orgSlug: fixture ? defaultOrgSlug(fixture) : undefined,
            signOut,
            getToken,
        }
    }, [state, signOut, getToken])
}

export function useSession() {
    const state = useFixtureState()
    const signOut = useSignOut()
    return useMemo(() => {
        if (state === LOADING) return { isLoaded: false, isSignedIn: undefined, session: null }
        if (!state) return { isLoaded: true, isSignedIn: false, session: null }
        const session = {
            id: `e2e-session-${state.role}`,
            lastActiveAt: SESSION_ACTIVE_AT,
            factorVerificationAge: [0, 0] as [number, number],
            touch: async () => session,
            end: signOut,
        }
        return { isLoaded: true, isSignedIn: true, session }
    }, [state, signOut])
}

export function useClerk() {
    const signOut = useSignOut()
    const openUserProfile = useCallback(() => {}, [])
    return useMemo(() => ({ isLoaded: true, signOut, openUserProfile }), [signOut, openUserProfile])
}

const NO_SIGN_IN_ERRORS = { fields: {}, raw: null, global: null }

export function useSignIn() {
    const authChanged = useAuthChanged()
    return useMemo(() => {
        // Reads fall through to the shared attempt; finalize needs this hook's router.
        const signIn = Object.create(fakeSignIn) as FakeSignIn & { finalize(): Promise<{ error: null }> }
        signIn.finalize = async () => {
            if (fakeSignIn.createdSessionId && fakeSignIn.role) {
                writeRoleCookieToDocument(fakeSignIn.role)
                authChanged()
            }
            return { error: null }
        }
        return { signIn, errors: NO_SIGN_IN_ERRORS, fetchStatus: 'idle' as const }
    }, [authChanged])
}

// Real Clerk puts a re-auth challenge in front of the fn; the fake has no challenge.
export function useReverification<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn
}
