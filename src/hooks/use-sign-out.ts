import { useClerk } from '@clerk/nextjs'
import { Routes } from '@/lib/routes'

// Hard-redirects on sign-out to force a full page reload, which destroys the
// React Query cache. Without this, signing in as a different user can show
// stale data from the previous session.
//
// The signin URL deliberately carries no redirect_url: after signing back in,
// users always land on their dashboard rather than the page they were on when
// the session ended (OTTER-671). Flows that need a different destination
// (e.g. invitation acceptance) pass redirectAfterSignOut explicitly.
export function useSignOut(options?: { redirectAfterSignOut: string }) {
    const { signOut } = useClerk()

    return async () => {
        const redirectUrl = options?.redirectAfterSignOut ?? Routes.accountSignin
        // Clerk's signOut() occasionally hangs. Race it against a timeout so
        // the redirect always fires — the middleware rejects stale sessions
        // regardless of whether the API call completed.
        await Promise.race([signOut(), new Promise((r) => setTimeout(r, 5_000))]).catch(() => {})
        window.location.assign(redirectUrl)
    }
}
