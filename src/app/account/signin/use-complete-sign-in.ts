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
import { useCallback } from 'react'
import { getOrgInfoForInviteAction, onJoinTeamAccountAction } from '../invitation/[inviteId]/create-account.action'

// A stale token matters far less than losing the invite or the key detour that follow it, so a
// refresh failure is logged rather than thrown.
async function refreshSessionToken(getToken: GetToken, caller: 'sign-in' | 'invite-accepted') {
    try {
        await getToken({ skipCache: true })
    } catch (error) {
        console.error(`session token refresh failed after ${caller}:`, error)
    }
}

// The session already exists by now, so a failure here must not abort the invite accept or the
// key detour that follow.
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

// Always resolves to a destination rather than throwing, so the key detour still runs on top.
async function acceptInviteAndResolveLanding(inviteId: string, getToken: GetToken): Promise<Route> {
    const joinTeamPage = Routes.accountInvitationJoinTeam({ inviteId }) as Route

    let org: { slug: string; name: string }
    try {
        // Read the org first: accepting marks the invite claimed, and the lookup only resolves unclaimed ones.
        org = actionResult(await getOrgInfoForInviteAction({ inviteId }))
    } catch (error) {
        // Unlike a join failure, retrying can never succeed here, and only the join-team page explains
        // that persistently — a dashboard would say it in a toast that vanishes.
        reportError(error, 'This invitation is no longer valid')
        return joinTeamPage
    }

    try {
        // actionResult despite the discarded value: it is what turns a failure into a throw for the catch.
        actionResult(await onJoinTeamAccountAction({ inviteId }))
    } catch (error) {
        // A failed join rolls its claim back, leaving the invite live, so land where Accept can be retried.
        reportError(error, 'Failed to accept your invitation. Please try again.')
        return joinTeamPage
    }

    // Same one-shot flag the join-team page sets, so this path lands on the dashboard banner.
    markOrgJoined(org.name)
    // After the landing is settled: nothing running once the membership exists may turn a successful
    // join into a retry prompt.
    await refreshSessionToken(getToken, 'invite-accepted')

    return Routes.orgDashboard({ orgSlug: org.slug }) as Route
}

// Everything that happens after Clerk hands back a session. Four screens establish one, and each
// had grown a copy of this with a different subset of the steps — the recovery-code screen ran none
// of it, so an invited user signing in with a backup code never joined the org.
export const useCompleteSignIn = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { getToken } = useAuth()

    return useCallback(async () => {
        try {
            const result = await completeServerSignIn(getToken)

            const rawRedirect = searchParams.get('redirect_url')
            let redirectUrl = rawRedirect ? safeRedirectUrl(rawRedirect, Routes.dashboard) : null

            const inviteId = searchParams.get('invite_id')
            // An invite outranks redirect_url: its landing is the only one that reflects the new
            // membership, and a deep link captured before the join may not even be reachable yet.
            if (inviteId) {
                redirectUrl = await acceptInviteAndResolveLanding(inviteId, getToken)
            }

            // Key generation last, so a keyless user still accepts the invite and resumes afterwards.
            router.push(
                result?.redirectToKeyGeneration ? keyGenerationUrl(redirectUrl) : (redirectUrl ?? Routes.dashboard),
            )
        } catch (error) {
            // Both steps above resolve their own failures, so reaching this means something unexpected
            // threw. The user is signed in either way, so navigate rather than strand them on the form.
            console.error('post sign-in navigation failed:', error)
            router.push(safeRedirectUrl(searchParams.get('redirect_url'), Routes.dashboard))
        }
    }, [router, searchParams, getToken])
}
