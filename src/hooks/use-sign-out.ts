import { useClerk } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'

// Hard-redirects on sign-out to force a full page reload, which destroys the
// React Query cache. Without this, signing in as a different user can show
// stale data from the previous session.
export function useSignOut(options?: { redirectAfterSignOut: string }) {
    const { signOut } = useClerk()
    const pathname = usePathname()

    return async () => {
        const redirectUrl = options?.redirectAfterSignOut ?? buildSignInUrl(pathname)
        try {
            await signOut({ redirectUrl })
        } catch {
            // manual hard redirect so the user always lands on the sign-in page.
            window.location.assign(redirectUrl)
        }
    }
}

function buildSignInUrl(pathname: string | null): string {
    const url = new URL('/account/signin', window.location.origin)
    if (pathname) url.searchParams.set('redirect_url', pathname)
    return url.toString()
}
