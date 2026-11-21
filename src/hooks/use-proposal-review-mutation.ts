'use client'

import { useRouter } from 'next/navigation'

import { useMutation } from '@/common'
import { showToast } from '@/components/toast-notifications'
import { captureException } from '@sentry/nextjs'
import { DECISION_NOTICES, type Decision } from '@/lib/review-decision'
import { Routes } from '@/lib/routes'
import { useSubmitOnce } from '@/hooks/use-submit-once'
import { submitProposalReviewAction } from '@/server/actions/proposal-review.actions'
import { actionResult } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'

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

    const {
        mutate,
        isPending,
        isSuccess,
        variables: pendingReview,
    } = useMutation({
        mutationFn: async (args: SubmitReviewArgs) =>
            actionResult(
                await submitProposalReviewAction({
                    orgSlug,
                    studyId,
                    reviewVersion,
                    ...args,
                    originTabId: tabSessionId,
                }),
            ),
        invalidates: () => [queryKeys.reviewerOrgStudies(orgSlug)],
        onError: (err) => {
            captureException(err)
            showToast(DECISION_NOTICES.failed)
        },
        onSuccess: () => {
            showToast(DECISION_NOTICES.submitted)

            router.push(Routes.studyReview({ orgSlug, studyId }))
        },
    })

    const submitReview = useSubmitOnce(mutate)

    // isPending clears when the action resolves, before the decided page replaces this one.
    return { submitReview, isSubmitting: isPending || isSuccess, pendingReview }
}
