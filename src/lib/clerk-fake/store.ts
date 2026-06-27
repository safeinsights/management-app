// E2E Clerk fake — client-side reactive session store.
//
// A tiny external store so every useUser/useAuth/useSession consumer re-renders
// together when setActive/signOut change the role. The source of truth is the
// __e2e_role cookie; this store mirrors it and notifies subscribers on change.

import { readRoleCookieFromDocument } from './cookie'
import { fixtureForRole, type FakeFixture } from './fixtures'

type Listener = () => void
const listeners = new Set<Listener>()

let cachedRole: string | null = null
let cachedFixture: FakeFixture | null = null

function refresh(): void {
    cachedRole = readRoleCookieFromDocument()
    cachedFixture = fixtureForRole(cachedRole)
}

refresh()

export function getFixture(): FakeFixture | null {
    return cachedFixture
}

// A sentinel distinct from "signed out" (null). During SSR and the first client render
// (used for hydration) the cookie isn't readable, so we report LOADING rather than
// signed-out. This keeps the server HTML and first client render identical (no hydration
// mismatch) AND prevents guards like RequireUser — which redirect only on isSignedIn ===
// false — from bouncing to /account/signin during the pre-hydration flash. A post-
// hydration effect (ClerkProvider) re-syncs to the real role.
export const LOADING = Symbol('clerk-fake-loading')
export type FixtureState = FakeFixture | null | typeof LOADING

export function getServerFixture(): FixtureState {
    return LOADING
}

export function notifyAuthChanged(): void {
    refresh()
    for (const l of listeners) l()
}

export function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export const AUTH_CHANGED_EVENT = 'e2e-clerk-changed'

// Keep the store in sync if the cookie is changed by another tab/context.
if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_CHANGED_EVENT, () => notifyAuthChanged())
}
