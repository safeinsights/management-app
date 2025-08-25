'use client'

import React, { FC, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Checkbox, Stack } from '@mantine/core'
import { useParams } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { reportMutationError } from '@/components/errors'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { useSession } from '@/hooks/session'

export const StudyReviewButtons: FC<{ study: SelectedStudy }> = ({ study }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { session } = useSession()
    const [useTestImage, setUseTestImage] = useState(false)

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
        onSuccess: () => window.location.assign(backPath),
    })

    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
        return <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
    }

    const TestingCheck = () => {
        if (!session?.team.isAdmin) return null

        return (
            <Checkbox
                checked={useTestImage}
                style={{ marginLeft: 'auto' }}
                onChange={(event) => setUseTestImage(event.currentTarget.checked)}
                label="Run this code against test base image"
            />
        )
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
            <TestingCheck />
        </Stack>
    )
}
