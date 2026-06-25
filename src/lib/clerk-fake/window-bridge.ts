// E2E Clerk fake — window.Clerk bridge.
//
// The Playwright helpers (tests/e2e.helpers.ts) read window.Clerk: loaded, user,
// session.end(), client.signIn.create(...), setActive(...), signOut(), status. We
// install a compatible shim so those helpers work without the real clerk-js.

import { clearRoleCookieFromDocument, writeRoleCookieToDocument } from './cookie'
import { fixtureForEmail, type FakeRole } from './fixtures'
import { buildFakeUser } from './user-resource'
import { createFakeSignIn, type FakeSignIn } from './sign-in-resource'
import { AUTH_CHANGED_EVENT, getFixture } from './store'

function emitAuthChanged(): void {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

function currentUserObject() {
    const fixture = getFixture()
    return fixture ? buildFakeUser(fixture) : null
}

// setActive maps a created session back to a role. Sessions are minted as
// `e2e-session-<role>`; we also accept the active signIn resource's role.
function roleFromSession(session: unknown, signIn: FakeSignIn): FakeRole | null {
    if (signIn.role) return signIn.role
    const id = typeof session === 'string' ? session : (session as { id?: string })?.id
    const match = id?.match(/^e2e-session-(admin|researcher|reviewer)$/)
    return (match?.[1] as FakeRole) ?? null
}

export function installClerkWindowBridge(): void {
    if (typeof window === 'undefined') return

    const signIn = createFakeSignIn()

    const setActive = async (params: { session?: unknown } | unknown) => {
        const session = (params as { session?: unknown })?.session ?? params
        const role = roleFromSession(session, signIn)
        if (role) {
            writeRoleCookieToDocument(role)
            emitAuthChanged()
        }
    }

    const signOut = async () => {
        clearRoleCookieFromDocument()
        emitAuthChanged()
    }

    const clerk = {
        loaded: true,
        status: 'ready',
        get user() {
            return currentUserObject()
        },
        get session() {
            return getFixture()
                ? {
                      id: `e2e-session-${getFixture()!.role}`,
                      lastActiveAt: new Date(),
                      end: signOut,
                      touch: async () => clerk.session,
                  }
                : null
        },
        client: {
            signIn: {
                create: (params: { identifier: string; password?: string }) => signIn.create(params),
            },
        },
        setActive,
        signOut,
    }

    // expose for the e2e helpers and for fixtureForEmail-driven sign-in helper.
    ;(window as unknown as { Clerk: typeof clerk }).Clerk = clerk
    // referenced so the import isn't dropped; the helper signs in by email.
    void fixtureForEmail
}
