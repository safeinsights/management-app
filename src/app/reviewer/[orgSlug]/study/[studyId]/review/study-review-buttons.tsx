'use client'

import React, { FC, useState } from 'react'
import { useMutation, useQueryClient } from '@/common'
import { Button, Group, Stack } from '@mantine/core'
import { useParams, useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { reportMutationError } from '@/components/errors'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { TestImageCheckbox } from './test-image-checkbox'

export const StudyReviewButtons: FC<{ study: SelectedStudy }> = ({ study }) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const [useTestImage, setUseTestImage] = useState(false)
    const queryClient = useQueryClient()

    const backPath = `/reviewer/${orgSlug}/dashboard`

    const {
        mutate: updateStudy,
        isPending,
        isSuccess,
        variables: pendingStatus,
    } = useMutation({
        mutationFn: (status: StudyStatus) => {
            if (status === 'APPROVED') {
                return approveStudyProposalAction({ orgSlug, studyId: study.id, useTestImage })
            }
            return rejectStudyProposalAction({ orgSlug, studyId: study.id })
        },
        onError: reportMutationError('Failed to update study status'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            router.push(backPath)
        },
    })

    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
        return <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
    }

    return (
        <Stack>
            <Group justify="flex-end">
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
            <TestImageCheckbox studyId={study.id} checked={useTestImage} onChange={setUseTestImage} />
        </Stack>
    )
}
