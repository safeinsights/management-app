// Shim for `@clerk/nextjs` in Ladle. Components render under Vite with no <ClerkProvider>, so the
// real Clerk hooks throw ("can only be used within <ClerkProvider>"), crashing any story whose
// import graph touches Clerk (e.g. <UserAvatar> via the users table). Stories never exercise auth —
// they pass fixture data — so every export here is an inert stand-in. <UserAvatar> reads the `user`
// prop we hand it and ignores the hook's `user`, so an empty session is fine. Type-only imports
// resolve against the real package during `tsc`; this alias is Vite-only.
import type { ReactNode } from 'react'

const noop = (..._args: unknown[]): void => {}

export function useUser() {
    return { isLoaded: true, isSignedIn: false, user: null }
}

export function useAuth() {
    return {
        isLoaded: true,
        isSignedIn: false,
        userId: null,
        sessionId: null,
        orgId: null,
        orgRole: null,
        orgSlug: null,
        getToken: async () => null,
        signOut: noop,
        has: () => false,
    }
}

export function useSession() {
    return { isLoaded: true, isSignedIn: false, session: null }
}

export function useClerk() {
    return { signOut: noop, openSignIn: noop, openSignUp: noop, redirectToSignIn: noop }
}

// Auth-mutation hooks. Stories that need these flows extract a Clerk-free *-view.tsx instead,
// so the hooks should never actually run here. We return shapes matching the real API but make
// the action paths throw — a story that triggers sign-in/reverification is hitting live auth it
// shouldn't, and the message says so rather than silently no-op'ing.
const throwIfCalled =
    (name: string) =>
    (..._args: unknown[]): never => {
        throw new Error(`@clerk/nextjs ${name} called in Ladle (stories must use a Clerk-free *-view.tsx)`)
    }

export function useSignIn() {
    return { isLoaded: true, setActive: throwIfCalled('signIn.setActive'), signIn: undefined }
}

export function useReverification<T extends (...args: never[]) => unknown>(fn: T): T {
    void fn
    return throwIfCalled('useReverification action') as unknown as T
}

// Provider + gates: render children (or nothing) so a story tree containing them doesn't crash.
export const ClerkProvider = ({ children }: { children?: ReactNode }) => <>{children}</>
export const Protect = ({ children }: { children?: ReactNode }) => <>{children}</>
export const SignedIn = ({ children }: { children?: ReactNode }) => <>{children}</>
export const SignedOut = (_props: { children?: ReactNode }) => null
export const RedirectToSignIn = () => null
