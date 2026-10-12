'use client'

import { FC, ReactNode } from 'react'
import type { Route } from 'next'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { InfoTooltip } from '@/components/tooltip'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { SUBMIT_CODE_ERROR_ID } from '@/components/study/submit-code-error'
import { Routes } from '@/lib/routes'
import type { NavAction } from '@/lib/study-screen'
import { resubmitCodeModalCopy } from '@/app/[orgSlug]/study/[studyId]/proposal/copy'
import { useProposalSubmitAttempt } from '@/app/[orgSlug]/study/[studyId]/proposal/use-proposal-submit-attempt'
import {
    RESUBMISSION_NOTE_FIELD_ID,
    RESUBMIT_CODE_BUTTON_ID,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'

interface EditStudyCodeFooterProps {
    mainFileName: string
    fileNames: string[]
    /** Why a resubmit would be refused, or null when it would go through. */
    blockedReason: string | null
    onSubmitAttempt: () => void
    filesEdited: boolean
    /** Present only when the round was reopened from the outputs step. */
    viewOutputs?: NavAction
}

const UNSAVED_EDITS_TOOLTIP =
    "Progress saved! Note: On leaving the edit mode, your changes won't be visible until you hit Resubmit code for review."

const ORDERED_FIELD_IDS = [SUBMIT_CODE_ERROR_ID, RESUBMISSION_NOTE_FIELD_ID]

// Either exit leaves edit mode, so both explain that unsubmitted edits stay private until resubmit.
const UnsavedEditsTooltip: FC<{ hasChanges: boolean; children: ReactNode }> = ({ hasChanges, children }) => {
    if (!hasChanges) return children
    return (
        <InfoTooltip label={UNSAVED_EDITS_TOOLTIP} withArrow maw={320}>
            {children}
        </InfoTooltip>
    )
}

// Flush the debounced note draft before navigating, or the last keystrokes are lost.
const useLeaveEditCode = ({ hasChanges, isBusy }: { hasChanges: boolean; isBusy: boolean }) => {
    const router = useRouter()
    const { saveDraft } = useEditCodeResubmit()

    return async (href: Route) => {
        if (isBusy) return
        if (hasChanges) {
            const saved = await saveDraft()
            if (!saved) return
        }
        router.push(href)
    }
}

type PreviousStepButtonProps = {
    hasChanges: boolean
    isBusy: boolean
    isSaving: boolean
    onClick: () => void
}

const PreviousStepButton: FC<PreviousStepButtonProps> = ({ hasChanges, isBusy, isSaving, onClick }) => {
    return (
        <UnsavedEditsTooltip hasChanges={hasChanges}>
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
        </UnsavedEditsTooltip>
    )
}

type ViewOutputsButtonProps = {
    action?: NavAction
    hasChanges: boolean
    isBusy: boolean
    onLeave: (href: Route) => void
}

const ViewOutputsButton: FC<ViewOutputsButtonProps> = ({ action, hasChanges, isBusy, onLeave }) => {
    if (!action) return null
    return (
        <UnsavedEditsTooltip hasChanges={hasChanges}>
            <Button
                type="button"
                variant="outline"
                size="md"
                disabled={isBusy}
                data-testid={action.testId}
                onClick={() => onLeave(action.href)}
            >
                {action.label}
            </Button>
        </UnsavedEditsTooltip>
    )
}

export const EditStudyCodeFooter: FC<EditStudyCodeFooterProps> = ({
    mainFileName,
    fileNames,
    blockedReason,
    onSubmitAttempt,
    filesEdited,
    viewOutputs,
}) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, orgName, noteForm, resubmit, isSaving, isSubmitting } = useEditCodeResubmit()

    const { attemptSubmit, isConfirmOpen, closeConfirm } = useProposalSubmitAttempt({
        isSubmitting,
        validate: () => {
            const invalid = new Set<string>()
            if (noteForm.validate().hasErrors) invalid.add(RESUBMISSION_NOTE_FIELD_ID)
            if (blockedReason) invalid.add(SUBMIT_CODE_ERROR_ID)
            return invalid
        },
        orderedFieldIds: ORDERED_FIELD_IDS,
    })

    const isBusy = isSaving || isSubmitting
    const exitTarget = Routes.studyView({ orgSlug, studyId })
    const hasChanges = noteForm.isDirty('resubmissionNote') || filesEdited
    const leave = useLeaveEditCode({ hasChanges, isBusy })

    // The files card names the reason, so a blocked click reports rather than doing nothing.
    const handleResubmitClick = () => {
        onSubmitAttempt()
        attemptSubmit()
    }

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
                    onClick={() => leave(exitTarget)}
                />
                <Group gap="md" align="flex-start">
                    <ViewOutputsButton action={viewOutputs} hasChanges={hasChanges} isBusy={isBusy} onLeave={leave} />
                    <Button
                        id={RESUBMIT_CODE_BUTTON_ID}
                        size="md"
                        variant="filled"
                        disabled={isBusy}
                        loading={isSubmitting}
                        onClick={handleResubmitClick}
                        aria-describedby={SUBMIT_CODE_ERROR_ID}
                    >
                        Resubmit code for review
                    </Button>
                </Group>
            </Group>

            <SubmitConfirmationModal
                isOpen={isConfirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmResubmit}
                isSubmitting={isSubmitting}
                {...resubmitCodeModalCopy(orgName)}
            />
        </>
    )
}
