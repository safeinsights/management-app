import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { useQueryClient } from '@/common'
import { SIGN_OUT_TIMEOUT_MS } from '@/lib/constants'
import { Routes } from '@/lib/routes'
import { withTimeout } from '@/lib/with-timeout'
import posthog from 'posthog-js'

export function useSignOut(options?: { redirectAfterSignOut: string }) {
    const { signOut } = useClerk()
    const router = useRouter()
    const queryClient = useQueryClient()

    return async () => {
        posthog.reset()
        // No redirect_url, so the next sign-in lands on the dashboard rather than the page the
        // session ended on (OTTER-671).
        const redirectUrl = options?.redirectAfterSignOut ?? Routes.accountSignin

        // redirectUrl skips Clerk's default '/', which the middleware bounces onward as a visible
        // extra hop. The wait is bounded because signOut() occasionally hangs; the replace below is
        // the exit either way, so there is nothing here to tell the user.
        await withTimeout(signOut({ redirectUrl }), SIGN_OUT_TIMEOUT_MS, 'signOut timed out').catch(() => {})
        router.replace(redirectUrl as Route)

        // Cleared only after navigating away, or a mounted observer refetches the outgoing user's
        // data back in.
        queryClient.clear()
        router.refresh()
    }
}
