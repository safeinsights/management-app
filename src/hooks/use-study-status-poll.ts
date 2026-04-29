'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'

import { useQuery } from '@/common'
import { Routes } from '@/lib/routes'
import { isActionError } from '@/lib/errors'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'
import { getStudyStatusAction } from '@/server/actions/editor.actions'

const POLL_INTERVAL_MS = 10_000

type Args = {
    studyId: string
    orgSlug: string
    /** Statuses where editing is still allowed. Mismatch triggers redirect. */
    editableStatuses: readonly string[]
    /** Where to send the user when status no longer matches. */
    redirectTarget: 'studySubmitted' | 'studyReview'
    enabled?: boolean
}

/**
 * Layer 3 fallback for the multi-user kick-out flow. When a client misses both the
 * Hocuspocus stateless event and the late-arriving Y.Map sentinel (because the
 * editor service is unreachable), this poll detects the status transition and
 * redirects with a generic toast.
 */
export function useStudyStatusPoll({ studyId, orgSlug, editableStatuses, redirectTarget, enabled = true }: Args) {
    const router = useRouter()
    const hasRedirectedRef = useRef(false)

    const { data } = useQuery({
        queryKey: ['study-status-poll', studyId],
        enabled,
        refetchInterval: () => (hasRedirectedRef.current ? false : POLL_INTERVAL_MS),
        refetchIntervalInBackground: false,
        staleTime: 0,
        queryFn: async () => {
            const result = await getStudyStatusAction({ studyId })
            if (isActionError(result)) throw new Error('Failed to fetch study status')
            return result
        },
    })

    useEffect(() => {
        if (!data || hasRedirectedRef.current) return
        if (editableStatuses.includes(data.status)) return

        hasRedirectedRef.current = true
        notifications.show({
            color: 'blue',
            title: 'Submission complete',
            message: 'This proposal has already been submitted. No further edits are allowed at this point.',
            autoClose: NOTIFICATION_DISPLAY_MS,
        })

        if (redirectTarget === 'studySubmitted') {
            router.push(Routes.studySubmitted({ orgSlug, studyId }))
        } else {
            router.push(Routes.studyReview({ orgSlug, studyId }))
        }
    }, [data, editableStatuses, orgSlug, studyId, redirectTarget, router])
}
