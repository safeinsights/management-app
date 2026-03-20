import { useClerk } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'

// Hard-redirects on sign-out so the full page reload destroys the React Query
// cache and other in-memory stores. Without this, signing in as a different
// user can show stale data from the previous session.
//
// We fire signOut() and window.location.assign() in parallel rather than
// sequentially because Clerk's internal onAfterSetActive hook calls
// router.refresh(), which can trigger a middleware redirect that destroys the
// JS context before signOut()'s promise resolves — preventing any code after
// `await signOut()` from ever executing.
export function useSignOut(options?: { redirectAfterSignOut: string }) {
    const { signOut } = useClerk()
    const pathname = usePathname()

    return () => {
        const redirectUrl = options?.redirectAfterSignOut ?? buildSignInUrl(pathname)
        void signOut({ redirectUrl })
        window.location.assign(redirectUrl)
    }
}

function buildSignInUrl(pathname: string | null): string {
    const url = new URL('/account/signin', window.location.origin)
    if (pathname) {
        url.searchParams.set('redirect_url', pathname)
    }
    return url.toString()
}
