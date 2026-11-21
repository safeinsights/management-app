'use client'

import { useEffect, useEffectEvent, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { pushDecided } from '@/lib/navigation'
import { Routes } from '@/lib/routes'
import { showToast } from '@/components/toast-notifications'
import { OUTPUTS_DECIDED_NOTIFICATION_ID } from '@/lib/outputs-review'
import type { StudyEvent } from '@/lib/collaboration-documents'
import { useStudyEvents } from '@/hooks/use-study-events'

type DecisionEventType = 'proposal-review-submitted' | 'code-review-submitted' | 'outputs-review-submitted'

// What the peer's decision closed, per round. Together, so a copy change can be read at a glance.
const DECISION_SUBJECT: Record<DecisionEventType, string> = {
    'proposal-review-submitted': 'this study proposal',
    'code-review-submitted': 'this output',
    'outputs-review-submitted': 'this output',
}

// Where the peer's decision leaves this tab. Only code needs its own route (REVIEWER_SCREEN_RULES).
const DECISION_ROUTE = {
    'proposal-review-submitted': Routes.studyReview,
    'code-review-submitted': Routes.studyReviewCode,
    'outputs-review-submitted': Routes.studyReview,
} satisfies Record<DecisionEventType, unknown>

export type SubmissionEventType = 'proposal-submitted' | 'code-submitted' | DecisionEventType

type Args = {
    orgSlug: string
    studyId: string
    /** The events this screen closes on. One channel carries every change of the study. */
    types: readonly SubmissionEventType[]
    /** For a screen scoped to one job, so another job's decision leaves it open. */
    jobId?: string
    enabled?: boolean
}

export function useSubmissionRedirectListener({ orgSlug, studyId, types, jobId, enabled = true }: Args) {
    const router = useRouter()
    const pathname = usePathname()
    const { tabId, subscribe } = useStudyEvents()
    const hasFiredRef = useRef(false)

    const handle = useEffectEvent((event: StudyEvent) => {
        const type = event.change as SubmissionEventType
        const submittedByName = event.submittedBy?.name
        // Filtered before the latch, so an event this screen ignores cannot use up its one redirect.
        if (!types.includes(type) || event.studyId !== studyId || !submittedByName) return
        if (jobId && event.jobId !== jobId) return
        if (hasFiredRef.current) return
        hasFiredRef.current = true
        // The submitting tab already navigated from its mutation onSuccess. Compared on tab id, not
        // user, so the same user's other tabs still close.
        if (event.originTabId === tabId) return

        if (type === 'proposal-submitted') {
            showToast({
                category: 'info',
                title: 'Proposal submitted',
                message: `${submittedByName} has proceeded to submit this study proposal to ${event.orgName}. No further edits are allowed at this point.`,
            })
            router.push(Routes.studySubmitted({ orgSlug, studyId }))
            return
        }

        if (type === 'code-submitted') {
            showToast({
                category: 'info',
                title: 'Code submitted',
                message: `${submittedByName} has submitted the code for review. No further edits are allowed at this point.`,
            })
            router.push(Routes.studyView({ orgSlug, studyId }))
            return
        }

        showToast({
            category: 'info',
            // Only the outputs round shares an id, with the status backstop that may reach the
            // same conclusion a moment later through this tab's own failed submit.
            id: type === 'outputs-review-submitted' ? OUTPUTS_DECIDED_NOTIFICATION_ID : undefined,
            title: 'Decision submitted',
            message: `${submittedByName} has proceeded to submit a decision on ${DECISION_SUBJECT[type]}. No further edits are allowed at this point.`,
        })
        pushDecided(router, pathname, DECISION_ROUTE[type]({ orgSlug, studyId }))
    })

    useEffect(() => {
        if (!enabled) return undefined
        return subscribe(handle)
    }, [enabled, subscribe])
}
