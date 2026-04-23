'use client'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import type { StudyStatus } from '@/database/types'
import { Routes } from '@/lib/routes'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { Button, Group } from '@mantine/core'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import type { FC } from 'react'

type ProposalReviewButtonsProps = {
    study: SelectedStudy
    orgSlug: string
    agreementsHref?: string
}

export const ProposalReviewButtons: FC<ProposalReviewButtonsProps> = ({ study, orgSlug, agreementsHref }) => {
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
                return approveStudyProposalAction({ orgSlug, studyId: study.id })
            }
            return rejectStudyProposalAction({ orgSlug, studyId: study.id })
        },
        onError: reportMutationError('Failed to update study status'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            router.push(backPath)
        },
    })

    // When navigating from agreements, show only the forward navigation button —
    // the reviewer is viewing the proposal for reference, not re-reviewing it
    if (agreementsHref) {
        return (
            <Group justify="flex-end">
                <Button onClick={() => router.push(agreementsHref as Route)}>Proceed to Step 2</Button>
            </Group>
        )
    }

    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
        return null
    }

    return (
        <Group justify="flex-end">
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus === 'REJECTED'}
                onClick={() => updateStudy('REJECTED')}
                variant="outline"
            >
                Reject request
            </Button>
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus === 'APPROVED'}
                onClick={() => updateStudy('APPROVED')}
            >
                Approve request
            </Button>
        </Group>
    )
}
