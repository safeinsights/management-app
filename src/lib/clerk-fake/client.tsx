'use client'

// E2E Clerk fake, aliased in for `@clerk/nextjs` when E2E_FAKE_CLERK is set. The 'use client'
// directive MUST stay at the top so Next registers the client boundary through the alias.
// Hook returns are memoized: a new object every render makes effects keyed on user/session/auth
// throw "Maximum update depth exceeded".

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { clearRoleCookieFromDocument, writeRoleCookieToDocument } from './cookie'
import { defaultOrgSlug, FAKE_ROLES, type FakeRole } from './fixtures'
import { buildFakeUser } from './user-resource'
import { createFakeSignIn } from './sign-in-resource'
import { getFixture, getServerFixture, LOADING, notifyAuthChanged, subscribe, type FixtureState } from './store'

function useFixtureState(): FixtureState {
    return useSyncExternalStore(subscribe, getFixture, getServerFixture)
}

// Stable across renders and recent enough that the inactivity watcher in activity-context
// never trips during tests.
const SESSION_ACTIVE_AT = new Date()

function doSignOut() {
    clearRoleCookieFromDocument()
    notifyAuthChanged()
}

export function ClerkProvider({ children }: { children: ReactNode; publishableKey?: string; nonce?: string }) {
    useEffect(() => {
        // Re-sync from the cookie so consumers that rendered signed-out during SSR flip
        // to the real role.
        notifyAuthChanged()
        ;(window as unknown as { isReactHydrated?: boolean }).isReactHydrated = true
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
    const signOut = useCallback(async () => doSignOut(), [])
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
    return useMemo(() => {
        if (state === LOADING) return { isLoaded: false, isSignedIn: undefined, session: null }
        if (!state) return { isLoaded: true, isSignedIn: false, session: null }
        const session = {
            id: `e2e-session-${state.role}`,
            lastActiveAt: SESSION_ACTIVE_AT,
            touch: async () => session,
            end: async () => doSignOut(),
        }
        return { isLoaded: true, isSignedIn: true, session }
    }, [state])
}

export function useClerk() {
    const signOut = useCallback(async () => doSignOut(), [])
    const openUserProfile = useCallback(() => {}, [])
    return useMemo(() => ({ isLoaded: true, signOut, openUserProfile }), [signOut, openUserProfile])
}

export function useSignIn() {
    const [signIn] = useState(createFakeSignIn)
    // setActive may be called from a different component (mfa.tsx) than the one that ran
    // create() (sign-in-form.tsx), so derive the role from the session id, not signIn.role.
    const setActive = useCallback(
        async (params: { session?: unknown } | unknown) => {
            const session = (params as { session?: unknown })?.session ?? params
            const id = typeof session === 'string' ? session : (session as { id?: string })?.id
            const match = id?.match(new RegExp(`^e2e-session-(${FAKE_ROLES.join('|')})$`))
            const role = (match?.[1] as FakeRole | undefined) ?? signIn.role
            if (role) {
                writeRoleCookieToDocument(role)
                notifyAuthChanged()
            }
        },
        [signIn],
    )
    return useMemo(() => ({ isLoaded: true, signIn, setActive }), [signIn, setActive])
}

// Real Clerk puts a re-auth challenge in front of the fn; the fake has no challenge.
export function useReverification<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn
}
