'use client'

import { FC } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { InfoTooltip } from '@/components/tooltip'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { Routes } from '@/lib/routes'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'

interface EditStudyCodeFooterProps {
    mainFileName: string
    fileNames: string[]
    hasFiles: boolean
    // True only once the user has uploaded, deleted, or chosen a main file this session (OTTER-558).
    // Not the mtime-based `filesChanged`, which is already true on load and hid the Cancel button.
    filesEdited: boolean
}

const SAVE_AND_EXIT_TOOLTIP =
    "Progress saved! Note: On exiting the edit mode, your changes won't be visible until you hit Resubmit study code."

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
    const exitTarget = Routes.studyView({ orgSlug, studyId })
    // OTTER-558: gate on edits made THIS session, not on content present on load. The note form is
    // seeded from a persisted draft, so `resubmissionNote.length > 0` is already true on reopen and
    // would show "Save and exit" before any real edit (the same defect `filesEdited` fixes for files).
    // `isDirty` compares against the seeded initial value, so it flips only on a real session edit.
    const hasChanges = noteForm.isDirty('resubmissionNote') || filesEdited

    const handleCancel = () => {
        if (isBusy) return
        router.push(exitTarget)
    }

    const handleSaveAndExit = async () => {
        if (isBusy) return
        const saved = await saveDraft()
        if (!saved) return
        router.push(exitTarget)
    }

    const canResubmit = hasFiles && mainFileName !== '' && noteForm.isValid() && !isBusy
    const handleConfirmResubmit = () => {
        closeConfirm()
        resubmit({ mainFileName, fileNames })
    }

    const exitButton = hasChanges ? (
        <InfoTooltip label={SAVE_AND_EXIT_TOOLTIP} withArrow multiline w={320}>
            <Button variant="outline" size="md" disabled={isBusy} loading={isSaving} onClick={handleSaveAndExit}>
                Save and exit
            </Button>
        </InfoTooltip>
    ) : (
        <Button variant="subtle" size="md" disabled={isBusy} onClick={handleCancel}>
            Cancel
        </Button>
    )

    return (
        <>
            <Group justify="flex-end" mt="xs">
                {exitButton}
                <Button
                    variant="primary"
                    size="md"
                    disabled={!canResubmit}
                    loading={isSubmitting}
                    onClick={openConfirm}
                >
                    Resubmit study code
                </Button>
            </Group>

            <SubmitConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmResubmit}
                isSubmitting={isSubmitting}
                title="Confirm study code resubmission?"
                body="Please confirm you are ready to resubmit your study code. Further edits are not permitted once submitted."
                confirmLabel="Yes, resubmit study code"
            />
        </>
    )
}
