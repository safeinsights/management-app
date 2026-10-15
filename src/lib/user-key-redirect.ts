import type { Route } from 'next'
import { Routes } from '@/lib/routes'

// My dashboard and Home are no destination: safeRedirectUrl falls back to the dashboard for a
// rejected redirect_url, and forwarding either one, with or without a query such as ?skip=, would
// override the inviting org's landing on the key page (OTTER-655, OTTER-744).
const NO_DESTINATION: ReadonlySet<string> = new Set([Routes.dashboard, Routes.home])

export function keyGenerationUrl(redirectUrl?: string | null): Route {
    if (!redirectUrl || NO_DESTINATION.has(redirectUrl.split(/[?#]/)[0])) return Routes.accountKeys

    return `${Routes.accountKeys}?redirect_url=${encodeURIComponent(redirectUrl)}` as Route
}
