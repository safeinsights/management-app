import type { Route } from 'next'
import { Routes } from '@/lib/routes'

// Routes.dashboard counts as no destination because safeRedirectUrl also returns it for a rejected
// redirect_url; forwarding it would pin the key page to "My dashboard" (OTTER-655).
export function keyGenerationUrl(redirectUrl?: string | null): Route {
    if (!redirectUrl || redirectUrl === Routes.dashboard) return Routes.accountKeys

    return `${Routes.accountKeys}?redirect_url=${encodeURIComponent(redirectUrl)}` as Route
}
