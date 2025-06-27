'use client'

import React, { FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Stack, Text } from '@mantine/core'
import { useParams, useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { reportMutationError } from '@/components/errors'
import StudyStatusDisplay from '@/components/study/study-status-display'
import { AppModal } from '@/components/modal'
import { useDisclosure } from '@mantine/hooks'

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
        onError: reportMutationError('Failed to update study status'),
        onSuccess: () => router.push(backPath),
    })

    const [isApproveModalOpen, { open: openApproveModal, close: closeApproveModal }] = useDisclosure(false)

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
                onClick={openApproveModal}
            >
                Approve
            </Button>
            <ConfirmStudyApprovalModal
                isOpen={isApproveModalOpen}
                onClose={closeApproveModal}
                onApprove={() => {
                    updateStudy('APPROVED')
                    closeApproveModal()
                }}
                isPending={isPending}
            />
        </Group>
    )
}

const ConfirmStudyApprovalModal: FC<{
    isOpen: boolean
    onClose: () => void
    onApprove: () => void
    isPending: boolean
}> = ({ isOpen, onClose, onApprove, isPending }) => {
    const router = useRouter()
    return (
        <AppModal isOpen={isOpen} onClose={onClose} title="Confirm decision" size="xl">
            <Stack>
                <Text size="md">
                    Once the code is processed, you&apos;ll need your Reviewer Key to access the encrypted logs and
                    results. Before proceeding, please make sure you have access to your unique Reviewer Key —{' '}
                    <b>without it, you won&apos;t be able to decrypt this study&apos;s results</b>.
                </Text>
                <Text size="sm" c="grey.6" fw={500}>
                    <span style={{ fontWeight: 'bolder' }}>Note: </span>
                    You were prompted to generate a key and save it locally during account creation.
                </Text>
                <Text size="md" mb="md">
                    Do you want to proceed?
                </Text>
                <Group justify="flex-start">
                    <Button variant="outline" size="sm" onClick={() => router.push('/account/keys')}>
                        Lost key? Generate new one
                    </Button>
                    <Button loading={isPending} onClick={onApprove}>
                        Yes, approve code
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
