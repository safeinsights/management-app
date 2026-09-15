'use client'

import { FC } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { InfoTooltip } from '@/components/tooltip'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { Routes } from '@/lib/routes'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'

interface EditStudyCodeFooterProps {
    mainFileName: string
    fileNames: string[]
    hasFiles: boolean
    // Real session edits, not the mtime-based `filesChanged`, which is already true on load
    // (OTTER-558).
    filesEdited: boolean
}

const UNSAVED_EDITS_TOOLTIP =
    "Progress saved! Note: On leaving the edit mode, your changes won't be visible until you hit Resubmit code for review."

type PreviousStepButtonProps = {
    hasChanges: boolean
    isBusy: boolean
    isSaving: boolean
    onClick: () => void
}

// The tooltip only earns its place when there is something to save on the way out.
const PreviousStepButton: FC<PreviousStepButtonProps> = ({ hasChanges, isBusy, isSaving, onClick }) => {
    const button = (
        <Button
            type="button"
            variant="subtle"
            size="md"
            leftSection={<CaretLeftIcon />}
            disabled={isBusy}
            loading={isSaving}
            onClick={onClick}
        >
            Previous step
        </Button>
    )
    if (!hasChanges) return button
    return (
        <InfoTooltip label={UNSAVED_EDITS_TOOLTIP} withArrow multiline w={320}>
            {button}
        </InfoTooltip>
    )
}

export const EditStudyCodeFooter: FC<EditStudyCodeFooterProps> = ({
    mainFileName,
    fileNames,
    hasFiles,
    filesEdited,
}) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, noteForm, saveDraft, resubmit, isSaving, isSubmitting } = useEditCodeResubmit()

    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    const isBusy = isSaving || isSubmitting
    // Back to the screen that offered "Edit code"; /view resolves to it whatever the state.
    const exitTarget = Routes.studyView({ orgSlug, studyId })
    // OTTER-558: the note form is seeded from a persisted draft, so isDirty (not a length check)
    // is what distinguishes a real session edit.
    const hasChanges = noteForm.isDirty('resubmissionNote') || filesEdited

    // Pending edits are flushed on the way out so stepping back never loses work.
    const handlePrevious = async () => {
        if (isBusy) return
        if (hasChanges) {
            const saved = await saveDraft()
            if (!saved) return
        }
        router.push(exitTarget)
    }

    const canResubmit = hasFiles && mainFileName !== '' && noteForm.isValid() && !isBusy
    const handleConfirmResubmit = () => {
        closeConfirm()
        resubmit({ mainFileName, fileNames })
    }

    return (
        <>
            <Group justify="space-between" align="flex-start" mt="xs">
                <PreviousStepButton
                    hasChanges={hasChanges}
                    isBusy={isBusy}
                    isSaving={isSaving}
                    onClick={handlePrevious}
                />
                <Button size="md" disabled={!canResubmit} loading={isSubmitting} onClick={openConfirm}>
                    Resubmit code for review
                </Button>
            </Group>

            <SubmitConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmResubmit}
                isSubmitting={isSubmitting}
                title="Resubmit code for review?"
                body="Please confirm you are ready to resubmit your study code. Further edits are not permitted once submitted."
                confirmLabel="Resubmit code"
            />
        </>
    )
}
