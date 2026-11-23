import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { safeRedirectUrl } from '@/lib/utils'

const pathOf = (url: string) => url.split(/[?#]/)[0]

export const globalAcknowledgementUrl = (redirectUrl: string): Route =>
    `${Routes.accountAgreements}?redirect_url=${encodeURIComponent(redirectUrl)}` as Route

// Never the step itself, which would send a user who owes nothing back to it.
export const globalAcknowledgementDestination = (redirectUrl: string | null | undefined): Route => {
    const destination = safeRedirectUrl(redirectUrl, Routes.dashboard)
    return pathOf(destination) === Routes.accountAgreements ? Routes.dashboard : destination
}
