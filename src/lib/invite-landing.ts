import { Routes } from '@/lib/routes'
import type { Route } from 'next'

// An invite only needs the linking screen when it was addressed to something other than the account
// that accepted it. Both addresses come from the server rather than the Clerk session, which can
// still hold the pre-sign-in snapshot at the moment this runs.
export function inviteLandingUrl(
    inviteId: string,
    orgSlug: string,
    invitedEmail: string,
    accountEmail: string | null,
): Route {
    if (accountEmail && accountEmail.toLowerCase() === invitedEmail.toLowerCase()) {
        return Routes.orgDashboard({ orgSlug }) as Route
    }

    return Routes.accountInvitationLinkEmail({ inviteId }) as Route
}
