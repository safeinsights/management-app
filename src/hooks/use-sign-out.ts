import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { useQueryClient } from '@/common'
import { Routes } from '@/lib/routes'
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
        // extra hop. The timeout is raced because signOut() occasionally hangs.
        await Promise.race([signOut({ redirectUrl }), new Promise((r) => setTimeout(r, 5_000))]).catch(() => {})
        router.replace(redirectUrl as Route)

        // Cleared only after navigating away, or a mounted observer refetches the outgoing user's
        // data back in.
        queryClient.clear()
        router.refresh()
    }
}
