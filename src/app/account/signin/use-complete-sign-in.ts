'use client'

import { reportError } from '@/components/errors'
import { markOrgJoined } from '@/lib/joined-org'
import { Routes } from '@/lib/routes'
import { keyGenerationUrl } from '@/lib/user-key-redirect'
import { actionResult, safeRedirectUrl } from '@/lib/utils'
import { onUserSignInAction } from '@/server/actions/user.actions'
import { useAuth } from '@clerk/nextjs'
import type { GetToken } from '@clerk/types'
import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import { getOrgInfoForInviteAction, onJoinTeamAccountAction } from '../invitation/[inviteId]/create-account.action'

// The session token is what carries fresh org metadata to the next page, but a stale token is a
// far smaller problem than losing the invite or the key detour that follows it, so a refresh
// failure is logged rather than thrown. The caller is named in the log because the two differ in
// what the user is left holding: after sign-in nothing has been committed yet, while after an
// invite accept the membership row already exists, so a stale token there means a joined user
// whose session cannot see the org.
async function refreshSessionToken(getToken: GetToken, caller: 'sign-in' | 'invite-accepted') {
    try {
        await getToken({ skipCache: true })
    } catch (error) {
        console.error(`session token refresh failed after ${caller}:`, error)
    }
}

// Clerk has already established the session by the time this runs, so a failure here must not
// abort the rest of the sequence: a pending invite still needs accepting, and the client key guard
// still catches a keyless account wherever it lands.
async function completeServerSignIn(getToken: GetToken) {
    try {
        const result = actionResult(await onUserSignInAction())
        await refreshSessionToken(getToken, 'sign-in')
        return result
    } catch (error) {
        console.error('onUserSignInAction failed:', error)
        return null
    }
}

// Always resolves to a destination rather than throwing, so the key detour still runs on top of
// whatever this decides.
async function acceptInviteAndResolveLanding(inviteId: string, getToken: GetToken): Promise<Route> {
    const joinTeamPage = Routes.accountInvitationJoinTeam({ inviteId }) as Route

    let org: { slug: string; name: string }
    try {
        // Read the org before joining: accepting marks the invite claimed,
        // and the lookup only resolves unclaimed invites.
        org = actionResult(await getOrgInfoForInviteAction({ inviteId }))
    } catch (error) {
        // A claimed or deleted invite, so retrying can never succeed, which is
        // distinct from a join failure that is worth retrying. The join-team
        // page renders a persistent "no longer valid" panel for this state, so
        // land there rather than on a dashboard where only the transient toast
        // explains what happened.
        reportError(error, 'This invitation is no longer valid')
        return joinTeamPage
    }

    try {
        // actionResult, despite the discarded value: it is what turns an
        // action failure into a throw, so the catch below can run.
        actionResult(await onJoinTeamAccountAction({ inviteId }))
    } catch (error) {
        // A join that fails inside its transaction rolls the claim back, leaving the invite live,
        // so return to the join-team page where Accept can be retried instead of silently landing
        // elsewhere.
        reportError(error, 'Failed to accept your invitation. Please try again.')
        return joinTeamPage
    }

    // Same one-shot flag the join-team page sets, so this path lands on
    // the dashboard banner.
    markOrgJoined(org.name)
    // Deliberately after the landing is settled: nothing that runs once the membership exists may
    // turn a successful join into a retry prompt.
    await refreshSessionToken(getToken, 'invite-accepted')

    return Routes.orgDashboard({ orgSlug: org.slug }) as Route
}

// Everything that has to happen after Clerk hands back a session, in one place. Four screens
// establish a session — password, second factor, recovery code, and password reset — and each had
// grown its own copy of this sequence with a different subset of the steps. The recovery-code
// screen ran none of them, so a user who followed an invite link and signed in with a backup code
// never joined the org (SHRMP-306).
export const useCompleteSignIn = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { getToken } = useAuth()

    return async () => {
        try {
            const result = await completeServerSignIn(getToken)

            const rawRedirect = searchParams.get('redirect_url')
            let redirectUrl = rawRedirect ? safeRedirectUrl(rawRedirect, Routes.dashboard) : null

            const inviteId = searchParams.get('invite_id')
            // An invite outranks redirect_url when both are present. Joining is the thing that just
            // changed, and its landing is the only one that reflects it: the dashboard confirms the
            // membership and carries the joined-org banner, while a deep link captured before the
            // join may still be unreachable to this account.
            if (inviteId) {
                redirectUrl = await acceptInviteAndResolveLanding(inviteId, getToken)
            }

            // Key generation last, so a keyless user still accepts their invite on the way through
            // and resumes where they were headed afterwards (OTTER-655).
            router.push(
                result?.redirectToKeyGeneration ? keyGenerationUrl(redirectUrl) : (redirectUrl ?? Routes.dashboard),
            )
        } catch (error) {
            // Last resort: both steps above resolve their own failures to a destination, so
            // reaching this means something unexpected threw. The user is signed in either way, so
            // navigate rather than stranding them on the form.
            console.error('post sign-in navigation failed:', error)
            router.push(safeRedirectUrl(searchParams.get('redirect_url'), Routes.dashboard))
        }
    }
}
