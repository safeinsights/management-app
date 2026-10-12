'use client'

import { FC, useState, type ReactNode } from 'react'
import type { Route } from 'next'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group, type ButtonVariant } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { InfoTooltip } from '@/components/tooltip'
import { MANTINE_VARIANT } from '@/components/study/step-navigation'
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

type EditCodeExit = 'previous' | 'outputs'

// Always flush, even when the note matches its page-load value: an earlier autosave may have
// stored something else, and leaving cancels the pending debounce. A no-op when already saved.
const useLeaveEditCode = ({ isBusy }: { isBusy: boolean }) => {
    const router = useRouter()
    const { saveDraft } = useEditCodeResubmit()
    const [leavingVia, setLeavingVia] = useState<EditCodeExit | null>(null)

    const leave = async (exit: EditCodeExit, href: Route) => {
        if (isBusy) return
        setLeavingVia(exit)
        const saved = await saveDraft()
        if (!saved) {
            setLeavingVia(null)
            return
        }
        router.push(href)
    }

    return { leave, leavingVia }
}

type LeaveEditCodeButtonProps = {
    label: string
    variant: ButtonVariant
    leftSection?: ReactNode
    testId?: string
    hasChanges: boolean
    isBusy: boolean
    isLeaving: boolean
    onClick: () => void
}

// Either exit leaves edit mode, so both explain that unsubmitted edits stay private until resubmit.
const LeaveEditCodeButton: FC<LeaveEditCodeButtonProps> = ({
    label,
    variant,
    leftSection,
    testId,
    hasChanges,
    isBusy,
    isLeaving,
    onClick,
}) => {
    return (
        <InfoTooltip label={UNSAVED_EDITS_TOOLTIP} withArrow maw={320} disabled={!hasChanges}>
            <Button
                type="button"
                variant={variant}
                size="md"
                leftSection={leftSection}
                disabled={isBusy}
                loading={isLeaving}
                data-testid={testId}
                onClick={onClick}
            >
                {label}
            </Button>
        </InfoTooltip>
    )
}

type ViewOutputsButtonProps = Omit<LeaveEditCodeButtonProps, 'label' | 'variant' | 'testId' | 'onClick'> & {
    action?: NavAction
    onLeave: (href: Route) => void
}

const ViewOutputsButton: FC<ViewOutputsButtonProps> = ({ action, onLeave, ...rest }) => {
    if (!action) return null
    return (
        <LeaveEditCodeButton
            {...rest}
            label={action.label}
            variant={MANTINE_VARIANT[action.variant]}
            testId={action.testId}
            onClick={() => onLeave(action.href)}
        />
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
    const { leave, leavingVia } = useLeaveEditCode({ isBusy })

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
                <LeaveEditCodeButton
                    label="Previous step"
                    variant="subtle"
                    leftSection={<CaretLeftIcon />}
                    hasChanges={hasChanges}
                    isBusy={isBusy}
                    isLeaving={isSaving && leavingVia === 'previous'}
                    onClick={() => leave('previous', exitTarget)}
                />
                <Group gap="md" align="flex-start">
                    <ViewOutputsButton
                        action={viewOutputs}
                        hasChanges={hasChanges}
                        isBusy={isBusy}
                        isLeaving={isSaving && leavingVia === 'outputs'}
                        onLeave={(href) => leave('outputs', href)}
                    />
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
