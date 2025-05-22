'use client'

import React, { FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Text, useMantineTheme } from '@mantine/core'
import { useParams, useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'

import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { reportMutationError } from '@/components/errors'

export const StudyReviewButtons: FC<{ study: SelectedStudy }> = ({ study }) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const backPath = `/reviewer/${orgSlug}/dashboard`

    const theme = useMantineTheme()

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

    if (study.status === 'APPROVED' && study.approvedAt) {
        return (
            <Group c="#12B886" gap="0.5rem" align="center">
                <CheckCircle weight="fill" size={24} color={theme.colors.green[9]} />
                <Text fz="xs" fw="semibold" c="green.9">
                    Approved on {dayjs(study.approvedAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
    }

    if (study.status === 'REJECTED' && study.rejectedAt) {
        return (
            <Group c="#FA5252" gap="0.5rem">
                <XCircle weight="fill" size={24} color={theme.colors.red[9]} />
                <Text fz="xs" fw="semibold" c="red.9">
                    Rejected on {dayjs(study.rejectedAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
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
