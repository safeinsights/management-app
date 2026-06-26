'use client'

// E2E Clerk fake — client shim.
//
// Aliased in for `@clerk/nextjs` when E2E_FAKE_CLERK is set (see next.config.ts).
// Provides ClerkProvider + the client hooks the app uses, backed by the __e2e_role
// cookie + fixtures. No clerk-js, no network. The 'use client' directive MUST stay at
// the top of this file so Next registers the client boundary through the alias.
//
// Hook returns are memoized on the fixture so their references stay stable across
// renders — consumers with effects keyed on user/session/auth must not see a new object
// every render (that causes "Maximum update depth exceeded").

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { clearRoleCookieFromDocument, writeRoleCookieToDocument } from './cookie'
import { defaultOrgSlug, type FakeRole } from './fixtures'
import { buildFakeUser } from './user-resource'
import { createFakeSignIn } from './sign-in-resource'
import { getFixture, getServerFixture, LOADING, notifyAuthChanged, subscribe, type FixtureState } from './store'

function useFixtureState(): FixtureState {
    return useSyncExternalStore(subscribe, getFixture, getServerFixture)
}

// Captured once so useSession().session.lastActiveAt is both stable across renders and
// recent enough that the inactivity watcher in activity-context never trips during tests.
const SESSION_ACTIVE_AT = new Date()

function doSignOut() {
    clearRoleCookieFromDocument()
    notifyAuthChanged()
}

export function ClerkProvider({ children }: { children: ReactNode; publishableKey?: string }) {
    useEffect(() => {
        // After hydration, re-sync the store from the cookie so consumers that rendered
        // signed-out during SSR flip to the real role.
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
    // One stable signIn resource per hook instance (lazy useState init, so it's safe to
    // read during render — unlike a ref).
    const [signIn] = useState(createFakeSignIn)
    // setActive may be called from a different component (mfa.tsx) than the one that ran
    // create() (sign-in-form.tsx), so derive the role from the session id
    // (`e2e-session-<role>`) rather than this hook's own signIn.role.
    const setActive = useCallback(
        async (params: { session?: unknown } | unknown) => {
            const session = (params as { session?: unknown })?.session ?? params
            const id = typeof session === 'string' ? session : (session as { id?: string })?.id
            const match = id?.match(/^e2e-session-(admin|researcher|reviewer)$/)
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

// useReverification wraps an async fn behind a re-auth challenge in real Clerk; in the
// fake there's no challenge, so we pass the fn through unchanged.
export function useReverification<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn
}
