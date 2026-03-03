import { useClerk } from '@clerk/nextjs'
import { useCallback } from 'react'

export function useSignOut() {
    const { signOut } = useClerk()

    return useCallback(
        async (redirectBack?: string) => {
            await signOut()
            const url = new URL('/account/signin', window.location.origin)
            if (redirectBack) {
                url.searchParams.set('redirect_url', redirectBack)
            }
            window.location.assign(url.toString())
        },
        [signOut],
    )
}
