import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { useQueryClient } from '@/common'
import { Routes } from '@/lib/routes'

export function useSignOut(options?: { redirectAfterSignOut: string }) {
    const { signOut } = useClerk()
    const router = useRouter()
    const queryClient = useQueryClient()

    return async () => {
        // App-initiated logout deliberately carries no redirect_url: the next sign-in
        // lands on the dashboard, not the page the user was on when the session ended
        // (OTTER-671). Deep links are unaffected — the proxy still captures the
        // destination when a signed-out browser requests a protected page. Flows that
        // need a different destination (e.g. invitation acceptance) pass
        // redirectAfterSignOut explicitly.
        const redirectUrl = options?.redirectAfterSignOut ?? Routes.accountSignin

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
