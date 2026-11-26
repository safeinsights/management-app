'use client'

import { ActionIcon } from '@mantine/core'
import { TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { showToast } from '@/components/toast-notifications'
import { softDeleteStudyAction } from '@/server/actions/study.actions'
import { StudyRow } from './types'
import { queryKeys } from '@/lib/query-keys'

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
                queryClient.invalidateQueries({ queryKey: queryKeys.researcherUserStudies() }),
                queryClient.invalidateQueries({ queryKey: queryKeys.researcherOrgStudiesAll() }),
            ])
            showToast({
                category: 'success',
                title: 'Proposal draft deleted',
                message: `Proposal draft ${draftLabel} was successfully deleted`,
            })
        },
        onError: reportMutationError('Failed to delete proposal draft'),
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
                color="red"
                onClick={open}
                aria-label={`Delete draft study ${draftLabel}`}
                data-testid="delete-draft-button"
            >
                <TrashIcon />
            </ActionIcon>
            <SubmitConfirmationModal
                isOpen={isOpen}
                onClose={close}
                onConfirm={confirm}
                isSubmitting={isPending}
                title="Confirm proposal draft deletion?"
                body="Please confirm that you are wanting to delete this proposal draft. Once this draft is deleted you will not be able to recover it. This action cannot be undone."
                confirmLabel="Yes, delete proposal draft"
                variant="error"
            />
        </>
    )
}
