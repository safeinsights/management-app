'use client'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import type { StudyStatus } from '@/database/types'
import { Routes } from '@/lib/routes'
import { approveStudyProposalAction, rejectStudyProposalAction } from '@/server/actions/study.actions'
import { useRouter } from 'next/navigation'

export function useProposalReviewMutation({ studyId, orgSlug }: { studyId: string; orgSlug: string }) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const backPath = Routes.orgDashboard({ orgSlug })

    const {
        mutate: updateStudy,
        isPending,
        isSuccess,
        variables: pendingStatus,
    } = useMutation({
        mutationFn: (status: StudyStatus) => {
            if (status === 'APPROVED') {
                return approveStudyProposalAction({ orgSlug, studyId })
            }
            return rejectStudyProposalAction({ orgSlug, studyId })
        },
        onError: reportMutationError('Failed to update study status'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            router.push(backPath)
        },
    })

    return { updateStudy, isPending, isSuccess, pendingStatus }
}
