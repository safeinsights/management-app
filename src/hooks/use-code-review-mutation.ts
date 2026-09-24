'use client'

import { usePathname, useRouter } from 'next/navigation'

import { useUser } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@/common'
import { notifications } from '@mantine/notifications'
import { captureException } from '@sentry/nextjs'
import { DECISION_NOTICES } from '@/lib/review-decision'
import { Routes } from '@/lib/routes'
import { codeReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { useBroadcastProvider } from '@/hooks/use-broadcast-provider'
import { type SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { submitCodeReviewDecisionAction } from '@/server/actions/study.actions'
import type { CodeReviewCriteria } from '@/hooks/use-code-review-evaluation-map'

export type SubmitCodeReviewArgs = {
    decision: 'approve' | 'needs-clarification' | 'reject'
    feedback: string
    criteria: CodeReviewCriteria
}

interface UseCodeReviewMutationOptions {
    studyId: string
    /** Keys the broadcast doc name. */
    jobId: string
    orgSlug: string
    tabSessionId: string
}

export function useCodeReviewMutation({ studyId, jobId, orgSlug, tabSessionId }: UseCodeReviewMutationOptions) {
    const router = useRouter()
    const pathname = usePathname()
    const queryClient = useQueryClient()
    const { user } = useUser()

    const broadcastProvider = useBroadcastProvider(codeReviewFeedbackDocName(jobId))

    const {
        mutate: submitReview,
        isPending,
        isSuccess,
        variables: pendingReview,
    } = useMutation({
        mutationFn: (args: SubmitCodeReviewArgs) => submitCodeReviewDecisionAction({ orgSlug, studyId, ...args }),
        onError: (err) => {
            captureException(err)
            notifications.show(DECISION_NOTICES.failed)
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            notifications.show(DECISION_NOTICES.submitted)

            const submittedByClerkId = user?.id
            if (broadcastProvider && submittedByClerkId) {
                const event: SubmissionEvent = {
                    type: 'code-review-submitted',
                    studyId,
                    submittedByTabId: tabSessionId,
                    submittedByClerkId,
                    submittedByName: result.submitterFullName,
                }
                broadcastProvider.sendStateless(JSON.stringify(event))
            }

            // Not bare /review, which REVIEWER_SCREEN_RULES resolves past this screen.
            const decided = Routes.studyReviewCode({ orgSlug, studyId })
            router.push(decided)
            // push() is a no-op when the editable form was reached at this same URL, leaving it mounted.
            if (pathname === decided) router.refresh()
        },
    })

    return { submitReview, isPending, isSuccess, pendingReview }
}
