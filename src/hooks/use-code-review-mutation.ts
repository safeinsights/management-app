'use client'

import { useRouter } from 'next/navigation'

import { useMutation } from '@/common'
import { showToast } from '@/components/toast-notifications'
import { captureException } from '@sentry/nextjs'
import { DECISION_NOTICES, type CodeDecision } from '@/lib/review-decision'
import { Routes } from '@/lib/routes'
import { useSubmitOnce } from '@/hooks/use-submit-once'
import { submitCodeReviewDecisionAction } from '@/server/actions/code-review.actions'
import type { CodeReviewCriteria } from '@/hooks/use-code-review-evaluation-map'
import { queryKeys } from '@/lib/query-keys'

export type SubmitCodeReviewArgs = {
    decision: CodeDecision
    feedback: string
    criteria: CodeReviewCriteria
}

interface UseCodeReviewMutationOptions {
    studyId: string
    orgSlug: string
    /** Sent as the action's originTabId, so this tab skips its own study event. */
    tabSessionId: string
}

export function useCodeReviewMutation({ studyId, orgSlug, tabSessionId }: UseCodeReviewMutationOptions) {
    const router = useRouter()
    const {
        mutate,
        isPending,
        isSuccess,
        variables: pendingReview,
    } = useMutation({
        mutationFn: (args: SubmitCodeReviewArgs) =>
            submitCodeReviewDecisionAction({ orgSlug, studyId, ...args, originTabId: tabSessionId }),
        invalidates: () => [queryKeys.reviewerOrgStudies(orgSlug)],
        onError: (err) => {
            captureException(err)
            showToast(DECISION_NOTICES.failed)
        },
        onSuccess: () => {
            showToast(DECISION_NOTICES.submitted)

            // Not bare /review, which REVIEWER_SCREEN_RULES resolves past this screen.
            router.push(Routes.studyReviewCode({ orgSlug, studyId }))
        },
    })

    const submitReview = useSubmitOnce(mutate)

    // isPending clears when the action resolves, before the decided page replaces this one.
    return { submitReview, isSubmitting: isPending || isSuccess, pendingReview }
}
