import { useClerk } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'

export function useSignOut(options?: { redirectAfterSignOut: string }) {
    const { signOut } = useClerk()
    const pathname = usePathname()

    return async () => {
        if (options?.redirectAfterSignOut) {
            await signOut({ redirectUrl: options.redirectAfterSignOut })
            return
        }
        await signOut()
        const url = new URL('/account/signin', window.location.origin)
        if (pathname) {
            url.searchParams.set('redirect_url', pathname)
        }
        window.location.assign(url.toString())
    }
}
