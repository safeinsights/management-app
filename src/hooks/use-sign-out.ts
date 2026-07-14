import { useClerk } from '@clerk/nextjs'
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
