'use client'

import { FC } from 'react'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import type { OutputsDecision } from '@/lib/outputs-review'

export const confirmationBody = (decision: OutputsDecision, labName: string): string =>
    decision === 'share-outputs'
        ? `You are sharing the output files and your feedback with ${labName}. You will not be able to make changes after submitting.`
        : `You are sharing your feedback only. The output files will not be shared with ${labName}. You will not be able to make changes after submitting.`

type SubmitOutputsDecisionModalProps = {
    /**
     * The decision being confirmed, or null when the modal is closed. A single nullable value
     * rather than an `isOpen` flag beside it: "open with no decision" is not a legal state, and
     * spelling it that way is what stops it needing a guard.
     */
    decision: OutputsDecision | null
    labName: string
    isSubmitting: boolean
    onClose: () => void
    onConfirm: () => void
}

export const SubmitOutputsDecisionModal: FC<SubmitOutputsDecisionModalProps> = ({
    decision,
    labName,
    isSubmitting,
    onClose,
    onConfirm,
}) => {
    // Unmounting while closed is what keeps the body text honest: Mantine's Modal keeps its
    // children mounted, so a cached body from the previously chosen option would be what a
    // screen reader re-announces on the next open.
    //
    // The unmount also pre-empts Mantine's own focus-return effect, so the caller has to restore
    // focus to the trigger itself; see closeAndRestoreFocus in outputs-review-panel.
    if (!decision) return null

    return (
        <SubmitConfirmationModal
            isOpen
            onClose={onClose}
            onConfirm={onConfirm}
            isSubmitting={isSubmitting}
            title="Submit your decision?"
            body={confirmationBody(decision, labName)}
            confirmLabel="Submit decision"
        />
    )
}
