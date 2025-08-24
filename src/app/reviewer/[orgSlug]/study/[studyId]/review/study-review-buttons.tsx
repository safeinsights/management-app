'use client'

import React, { FC, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Group, Checkbox, Stack, Text } from '@mantine/core'
import { useParams, useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
    doesTestImageExistForStudyAction,
} from '@/server/actions/study.actions'
import { reportMutationError } from '@/components/errors'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { useSession } from '@/hooks/session'

export const StudyReviewButtons: FC<{ study: SelectedStudy }> = ({ study }) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { session } = useSession()
    const [useTestImage, setUseTestImage] = useState(false)

    const { data: testImageExists } = useQuery({
        queryKey: ['testImageExists', study.id],
        queryFn: () => doesTestImageExistForStudyAction({ studyId: study.id }),
        enabled: !!session?.team.isAdmin,
    })

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
        onSuccess: () => router.push(backPath),
    })

    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
        return <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
    }

    const TestingCheck = () => {
        if (!session?.team.isAdmin) return null

        const label = 'Run this code against test base image'

        if (!testImageExists) {
            return (
                <Checkbox
                    checked={false}
                    disabled
                    style={{ marginLeft: 'auto' }}
                    label={
                        <>
                            <Text span td="line-through" c="dimmed">
                                {label}
                            </Text>
                            <Text span c="dimmed">
                                {' (test base image not existing)'}
                            </Text>
                        </>
                    }
                />
            )
        }

        return (
            <Checkbox
                checked={useTestImage}
                style={{ marginLeft: 'auto' }}
                onChange={(event) => setUseTestImage(event.currentTarget.checked)}
                label={label}
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
