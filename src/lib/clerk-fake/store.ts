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

// Distinct from "signed out" (null): the cookie is unreadable during SSR, and reporting LOADING
// keeps guards like RequireUser from bouncing to /account/signin in the pre-hydration flash.
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

if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_CHANGED_EVENT, () => notifyAuthChanged())
}
