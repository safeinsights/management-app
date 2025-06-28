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

    // Show the confirmation modal again only if 48 hours have passed since the last action.
    const HOURS_MS = 48 * 60 * 60 * 1000 // 48 hours
    const ACTION_TIMESTAMP_KEY = 'studyApprovalActionAt'

    // Persist a timestamp in localStorage whenever the user either approves the study or chooses to generate a new key from the modal.
    const saveActionTimestamp = () => {
        try {
            localStorage.setItem(ACTION_TIMESTAMP_KEY, Date.now().toString())
        } catch (error) {
            console.error('Failed to write to localStorage', error)
        }
    }

    // When the "Approve" button is clicked:
    // • If a modal action (approve or generate key) occurred within the past 48 hours, skip the modal and approve immediately.
    // • Otherwise, display the confirmation modal.
    const showConfirmationModal = () => {
        if (isPending || isSuccess) {
            return
        }

        try {
            const lastAction = localStorage.getItem(ACTION_TIMESTAMP_KEY)
            if (lastAction && Date.now() - parseInt(lastAction, 10) < HOURS_MS) {
                updateStudy('APPROVED')
                return
            }
        } catch (error) {
            console.error('Failed to read from localStorage', error)
        }

        openApproveModal()
    }

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
                onClick={showConfirmationModal}
            >
                Approve
            </Button>
            <ConfirmStudyApprovalModal
                isOpen={isApproveModalOpen}
                onClose={closeApproveModal}
                onApprove={() => {
                    saveActionTimestamp()
                    updateStudy('APPROVED')
                    closeApproveModal()
                }}
                handleActionTimestamp={saveActionTimestamp}
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
    handleActionTimestamp: () => void
}> = ({ isOpen, onClose, onApprove, isPending, handleActionTimestamp }) => {
    const router = useRouter()

    const handleGenerateKey = () => {
        handleActionTimestamp()
        router.push('/account/keys')
    }

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
                    <Button variant="outline" size="sm" onClick={handleGenerateKey}>
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
