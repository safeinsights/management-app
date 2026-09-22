'use client'

import { useRouter } from 'next/navigation'

import { useUser } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@/common'
import { notifications } from '@mantine/notifications'
import { captureException } from '@sentry/nextjs'
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
            notifications.show({
                color: 'red',
                title: 'Decision could not be submitted',
                message: 'Your work is saved. Try again.',
            })
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            notifications.show({ color: 'green', title: 'Decision submitted', message: '' })

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

            router.push(Routes.studyReview({ orgSlug, studyId }))
        },
    })

    return { submitReview, isPending, isSuccess, pendingReview }
}
