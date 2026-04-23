'use client'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import type { Decision } from '@/app/[orgSlug]/study/[studyId]/review/review-types'
import { Routes } from '@/lib/routes'
import { submitProposalReviewAction } from '@/server/actions/study.actions'
import { useRouter } from 'next/navigation'

export type SubmitReviewArgs = { decision: Decision; feedback: string }

export function useProposalReviewMutation({ studyId, orgSlug }: { studyId: string; orgSlug: string }) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const backPath = Routes.orgDashboard({ orgSlug })

    const {
        mutate: submitReview,
        isPending,
        isSuccess,
        variables: pendingReview,
    } = useMutation({
        mutationFn: (args: SubmitReviewArgs) => submitProposalReviewAction({ orgSlug, studyId, ...args }),
        onError: reportMutationError('Failed to submit review'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            router.push(backPath)
        },
    })

    return { submitReview, isPending, isSuccess, pendingReview }
}
