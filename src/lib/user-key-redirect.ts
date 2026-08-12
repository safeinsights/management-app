import type { Route } from 'next'
import { Routes } from '@/lib/routes'

// Key generation is the last step of signup, so callers hand it the destination the user was headed
// for. A bare url is deliberate: the key page then resolves its own landing. Routes.dashboard counts
// as no destination, because it is also what safeRedirectUrl returns for a rejected redirect_url.
// Forwarding it would pin the key page to "My dashboard" and defeat that resolution (OTTER-655).
export function keyGenerationUrl(redirectUrl?: string | null): Route {
    if (!redirectUrl || redirectUrl === Routes.dashboard) return Routes.accountKeys

    return `${Routes.accountKeys}?redirect_url=${encodeURIComponent(redirectUrl)}` as Route
}
