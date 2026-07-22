import { useClerk } from '@clerk/nextjs'
<<<<<<< HEAD
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
=======
import { useRouter, usePathname } from 'next/navigation'
import type { Route } from 'next'
import { useQueryClient } from '@/common'

export function useSignOut(options?: { redirectAfterSignOut: string }) {
    const { signOut } = useClerk()
    const pathname = usePathname()
    const router = useRouter()
    const queryClient = useQueryClient()

    return async () => {
        const redirectUrl = options?.redirectAfterSignOut ?? buildSignInUrl(pathname)

        // Pass redirectUrl so Clerk skips its default afterSignOutUrl ('/'), which the
        // middleware bounces to the sign-in page — the extra hop that flashed during invite
        // accept. Race a timeout since signOut() occasionally hangs; router.replace then
        // guarantees a soft navigation even when Clerk doesn't perform its own (e.g. the e2e fake).
        await Promise.race([signOut({ redirectUrl }), new Promise((r) => setTimeout(r, 5_000))]).catch(() => {})
        router.replace(redirectUrl as Route)

        // Clear caches only after the session is gone and we've navigated away, so a mounted
        // observer can't refetch the outgoing user's data back in. Covers React Query plus any
        // user-specific server-rendered payload in the Router Cache.
        queryClient.clear()
        router.refresh()
    }
}

function buildSignInUrl(pathname: string | null): string {
    const url = new URL('/account/signin', window.location.origin)
    if (pathname) url.searchParams.set('redirect_url', pathname)
    return url.pathname + url.search
}
>>>>>>> origin/main
