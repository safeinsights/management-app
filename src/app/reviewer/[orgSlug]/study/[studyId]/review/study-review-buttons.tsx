'use client'

import React, { FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group } from '@mantine/core'
import { useParams, useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { reportMutationError } from '@/components/errors'
import StudyStatusDisplay from '@/components/study/study-status-display'

export const StudyReviewButtons: FC<{ study: SelectedStudy }> = ({ study }) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const backPath = `/reviewer/${orgSlug}/dashboard`

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
        onError: reportMutationError,
        onSuccess: () => router.push(backPath),
    })

    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
        return <StudyStatusDisplay status={study.status} date={study.approvedAt ?? study.rejectedAt} />
    }

    return (
        <Group>
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus == 'REJECTED'}
                onClick={() => updateStudy('REJECTED')}
                variant="outline"
            >
                Reject
            </Button>
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus == 'APPROVED'}
                onClick={() => updateStudy('APPROVED')}
            >
                Approve
            </Button>
        </Group>
    )
}
