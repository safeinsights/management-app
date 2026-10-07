'use client'

import { useUser } from '@clerk/nextjs'
import { usePathname, useRouter } from 'next/navigation'

import { useMutation, useQueryClient } from '@/common'
import { showToast } from '@/components/toast-notifications'
import { captureException } from '@sentry/nextjs'
import { pushDecided } from '@/lib/navigation'
import { DECISION_NOTICES, type Decision } from '@/lib/review-decision'
import { Routes } from '@/lib/routes'
import { type SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { useReviewFeedbackProvider } from '@/lib/realtime/review-feedback-provider-context'
import { submitProposalReviewAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'

export type SubmitReviewArgs = { decision: Decision; feedback: string }

interface UseProposalReviewMutationOptions {
    studyId: string
    orgSlug: string
    tabSessionId: string
    reviewVersion: number
}

export function useProposalReviewMutation({
    studyId,
    orgSlug,
    tabSessionId,
    reviewVersion,
}: UseProposalReviewMutationOptions) {
    const router = useRouter()
    const pathname = usePathname()
    const queryClient = useQueryClient()
    const { user } = useUser()
    // The editor's provider is authenticated since page mount, so the server's onStateless gate
    // passes; a private provider could still be mid-handshake and get dropped silently.
    const editorProvider = useReviewFeedbackProvider()

    const {
        mutate: submitReview,
        isPending,
        isSuccess,
        variables: pendingReview,
    } = useMutation({
        mutationFn: async (args: SubmitReviewArgs) =>
            actionResult(await submitProposalReviewAction({ orgSlug, studyId, reviewVersion, ...args })),
        onError: (err) => {
            captureException(err)
            showToast(DECISION_NOTICES.failed)
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            showToast(DECISION_NOTICES.submitted)

            const submittedByClerkId = user?.id
            if (editorProvider && submittedByClerkId) {
                const event: SubmissionEvent = {
                    type: 'proposal-review-submitted',
                    studyId,
                    submittedByTabId: tabSessionId,
                    submittedByClerkId,
                    submittedByName: result.submitterFullName,
                }
                editorProvider.sendStateless(JSON.stringify(event))
            }

            pushDecided(router, pathname, Routes.studyReview({ orgSlug, studyId }))
        },
    })

    // isPending clears when the action resolves, before the decided page replaces this one.
    return { submitReview, isSubmitting: isPending || isSuccess, pendingReview }
}
