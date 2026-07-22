import { useClerk } from '@clerk/nextjs'
import { Routes } from '@/lib/routes'

// Hard-redirects on sign-out to force a full page reload, which destroys the
// React Query cache. Without this, signing in as a different user can show
// stale data from the previous session.
//
// App-initiated logout deliberately carries no redirect_url: the next sign-in
// lands on the dashboard, not the page the user was on when the session ended
// (OTTER-671). Deep links are unaffected — the proxy still captures the
// destination when a signed-out browser requests a protected page. Flows that
// need a different destination (e.g. invitation acceptance) pass
// redirectAfterSignOut explicitly.
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
