'use client'

import { FC, useCallback, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { InfoTooltip } from '@/components/tooltip'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { Routes } from '@/lib/routes'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import {
    RESUBMISSION_NOTE_FIELD_ID,
    RESUBMIT_CODE_BUTTON_ID,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'

interface EditStudyCodeFooterProps {
    mainFileName: string
    fileNames: string[]
    hasFiles: boolean
    filesEdited: boolean
}

const UNSAVED_EDITS_TOOLTIP =
    "Progress saved! Note: On leaving the edit mode, your changes won't be visible until you hit Resubmit code for review."

const ORDERED_FIELD_IDS = [RESUBMISSION_NOTE_FIELD_ID]

type PreviousStepButtonProps = {
    hasChanges: boolean
    isBusy: boolean
    isSaving: boolean
    onClick: () => void
}

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
    const { studyId, orgName, noteForm, saveDraft, resubmit, isSaving, isSubmitting } = useEditCodeResubmit()

    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    const wasSubmitting = useRef(false)
    useEffect(() => {
        if (wasSubmitting.current && !isSubmitting) closeConfirm()
        wasSubmitting.current = isSubmitting
    }, [isSubmitting, closeConfirm])

    const isBusy = isSaving || isSubmitting
    const exitTarget = Routes.studyView({ orgSlug, studyId })
    const hasChanges = noteForm.isDirty('resubmissionNote') || filesEdited

    const handlePrevious = async () => {
        if (isBusy) return
        if (hasChanges) {
            const saved = await saveDraft()
            if (!saved) return
        }
        router.push(exitTarget)
    }

    const attemptSubmit = useCallback(() => {
        const invalid = new Set<string>()
        if (noteForm.validate().hasErrors) invalid.add(RESUBMISSION_NOTE_FIELD_ID)

        if (invalid.size > 0) {
            focusFirstInvalid(ORDERED_FIELD_IDS, (id) => invalid.has(id))
            return
        }

        if (!hasFiles || mainFileName === '') return

        openConfirm()
    }, [noteForm, hasFiles, mainFileName, openConfirm])

    const handleConfirmResubmit = () => {
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
                <Button
                    id={RESUBMIT_CODE_BUTTON_ID}
                    size="md"
                    variant="filled"
                    disabled={isBusy}
                    loading={isSubmitting}
                    onClick={attemptSubmit}
                >
                    Resubmit code for review
                </Button>
            </Group>

            <SubmitConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmResubmit}
                isSubmitting={isSubmitting}
                title="Resubmit your code for review?"
                body={`Your code will be sent to ${orgName} for review. If approved, it will run in the secure enclave. You will not be able to make changes after you submit.`}
                confirmLabel="Resubmit code"
            />
        </>
    )
}
