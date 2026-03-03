import { useClerk } from '@clerk/nextjs'
import { useCallback } from 'react'

export function useSignOut() {
    const { signOut } = useClerk()

    return useCallback(async () => {
        await signOut()
        // Hard redirect destroys the React app and clears stale QueryClient cache
        window.location.assign('/account/signin')
    }, [signOut])
}
