'use client'

import { FC, useState } from 'react'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import type { OutputsDecision } from '@/lib/outputs-review'

export const confirmationBody = (decision: OutputsDecision, labName: string): string =>
    decision === 'share-outputs'
        ? `You are sharing the output files and your feedback with ${labName}. You will not be able to make changes after submitting.`
        : `You are sharing your feedback only. The output files will not be shared with ${labName}. You will not be able to make changes after submitting.`

type SubmitOutputsDecisionModalProps = {
    /** null is the closed state; a separate `isOpen` flag could disagree with it. */
    decision: OutputsDecision | null
    labName: string
    isSubmitting: boolean
    onClose: () => void
    onConfirm: () => void
}

// Stays mounted while closed: returning null would unmount ModalBase, which owns
// `useFocusReturn`, so focus would never return to the trigger.
export const SubmitOutputsDecisionModal: FC<SubmitOutputsDecisionModalProps> = ({
    decision,
    labName,
    isSubmitting,
    onClose,
    onConfirm,
}) => {
    // Adjusted during render, not in an effect, so the modal never shows the previous decision's
    // text for a frame.
    const [shown, setShown] = useState<OutputsDecision>(decision ?? 'share-outputs')
    if (decision && decision !== shown) setShown(decision)

    return (
        <SubmitConfirmationModal
            isOpen={decision !== null}
            onClose={onClose}
            onConfirm={onConfirm}
            isSubmitting={isSubmitting}
            title="Submit your decision?"
            body={confirmationBody(shown, labName)}
            confirmLabel="Submit decision"
        />
    )
}
