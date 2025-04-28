'use client'

import React, { FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Text } from '@mantine/core'
import { useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'

import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'

export const StudyReviewButtons: FC<{ study: SelectedStudy; memberSlug: string }> = ({ study, memberSlug }) => {
    const router = useRouter()

    const backPath = `/reviewer/${memberSlug}/dashboard`

    const {
        mutate: updateStudy,
        isPending,
        isSuccess,
        variables: pendingStatus,
    } = useMutation({
        mutationFn: (status: StudyStatus) => {
            if (status === 'APPROVED') {
                return approveStudyProposalAction(study.id)
            }

            return rejectStudyProposalAction(study.id)
        },
        onSettled(error) {
            if (!error) {
                router.push(backPath)
            }
        },
    })

    if (study.status === 'APPROVED' && study.approvedAt) {
        return (
            <Group c="#12B886" gap="0">
                <CheckCircle weight="fill" />
                <Text>Approved on {dayjs(study.approvedAt).format('MMM DD, YYYY')}</Text>
            </Group>
        )
    }

    if (study.status === 'REJECTED' && study.rejectedAt) {
        return (
            <Group c="#FA5252" gap="0">
                <XCircle weight="fill" />
                <Text>Rejected on {dayjs(study.rejectedAt).format('MMM DD, YYYY')}</Text>
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
