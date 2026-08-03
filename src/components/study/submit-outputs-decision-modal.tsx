'use client'

import { FC } from 'react'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import type { OutputsDecision } from '@/lib/outputs-review'

export const confirmationBody = (decision: OutputsDecision, labName: string): string =>
    decision === 'share-outputs'
        ? `You are sharing the output files and your feedback with ${labName}. You will not be able to make changes after submitting.`
        : `You are sharing your feedback only. The output files will not be shared with ${labName}. You will not be able to make changes after submitting.`

type SubmitOutputsDecisionModalProps = {
    /** null keeps the modal closed; submit only opens it once an option is picked. */
    decision: OutputsDecision | null
    labName: string
    isOpen: boolean
    isSubmitting: boolean
    onClose: () => void
    onConfirm: () => void
}

export const SubmitOutputsDecisionModal: FC<SubmitOutputsDecisionModalProps> = ({
    decision,
    labName,
    isOpen,
    isSubmitting,
    onClose,
    onConfirm,
}) => {
    // Unmounting while closed is what keeps the body text honest: Mantine's Modal keeps its
    // children mounted, so a cached body from the previously chosen option would be what a
    // screen reader re-announces on the next open.
    if (!isOpen || !decision) return null

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
