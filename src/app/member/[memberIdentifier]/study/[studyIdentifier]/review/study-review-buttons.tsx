'use client'

import React, { FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Text } from '@mantine/core'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import { approveStudyProposal, rejectStudyProposal, type SelectedStudy } from '@/server/actions/study-actions'
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'

export const StudyReviewButtons: FC<{ study: SelectedStudy; memberIdentifier: string }> = ({
    study,
    memberIdentifier,
}) => {
    const router = useRouter()

    const backPath = `/member/${memberIdentifier}/dashboard`

    const {
        mutate: updateStudy,
        isPending,
        error,
    } = useMutation({
        mutationFn: (status: StudyStatus) => {
            if (status === 'APPROVED') {
                return approveStudyProposal(study.id)
            }

            return rejectStudyProposal(study.id)
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

    if (!study) return <AlertNotFound title="No study found" message="The study was not found" />
    if (error) return <ErrorAlert error={error} />

    return (
        <Group>
            <Button color="#291BC4" onClick={() => updateStudy('REJECTED')} loading={isPending} variant="outline">
                Reject
            </Button>
            <Button color="#291BC4" onClick={() => updateStudy('APPROVED')} loading={isPending}>
                Approve
            </Button>
        </Group>
    )
}
