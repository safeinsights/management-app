'use client'

import { ActionIcon, Button, Group, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@/common'
import { AppModal } from '@/components/modals/app-modal'
import { softDeleteStudyAction } from '@/server/actions/study.actions'
import { StudyRow } from './types'

const UNTITLED_DRAFT_FALLBACK = 'Untitled Draft'

function useDeleteDraft(study: StudyRow) {
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const draftLabel = study.title ?? UNTITLED_DRAFT_FALLBACK

    const { mutate, isPending } = useMutation({
        mutationFn: softDeleteStudyAction,
        onSuccess: async () => {
            setIsOpen(false)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] }),
                queryClient.invalidateQueries({ queryKey: ['researcher-studies'] }),
            ])
            notifications.show({
                title: 'Proposal draft deleted',
                message: `Proposal draft ${draftLabel} was successfully deleted`,
                color: 'green',
            })
        },
        onError: (error) => {
            notifications.show({
                title: 'Failed to delete proposal draft',
                message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
                color: 'red',
            })
        },
    })

    return {
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        confirm: () => mutate({ studyId: study.id }),
        isPending,
        draftLabel,
    }
}

export function DeleteDraftButton({ study }: { study: StudyRow }) {
    const { isOpen, open, close, confirm, isPending, draftLabel } = useDeleteDraft(study)

    return (
        <>
            <ActionIcon
                variant="subtle"
                color="red.9"
                onClick={open}
                aria-label={`Delete draft study ${draftLabel}`}
                data-testid="delete-draft-button"
            >
                <TrashIcon />
            </ActionIcon>
            <AppModal
                isOpen={isOpen}
                onClose={close}
                title="Confirm proposal draft deletion?"
                closeButtonProps={{ 'aria-label': 'Close' }}
            >
                <Stack>
                    <Text size="md">
                        Please confirm that you are wanting to delete this proposal draft. Once this draft is deleted
                        you will not be able to recover it. This action cannot be undone.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="outline" onClick={close} disabled={isPending}>
                            Cancel
                        </Button>
                        <Button variant="filled" color="red.9" onClick={confirm} loading={isPending}>
                            Yes, delete proposal draft
                        </Button>
                    </Group>
                </Stack>
            </AppModal>
        </>
    )
}
