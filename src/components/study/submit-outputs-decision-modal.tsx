'use client'

import { FC, useState } from 'react'
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
     * spelling it this way is what stops it needing a guard.
     */
    decision: OutputsDecision | null
    labName: string
    isSubmitting: boolean
    onClose: () => void
    onConfirm: () => void
}

/**
 * Stays mounted across open and close, and lets Mantine own both behaviours the AC asks for.
 *
 * Mantine renders modal content inside its exit Transition and unmounts it once the transition
 * finishes (`keepMounted` defaults to false), so each open already mounts fresh copy: the body text
 * cannot be a stale cached announcement. Returning null while closed would achieve the same thing,
 * but it also unmounts ModalBase, and `useFocusReturn` lives in there, so focus would never return
 * to the trigger on Escape, Cancel or X.
 *
 * The last non-null decision is retained only so the body does not blank out mid-animation while
 * the modal fades away.
 */
export const SubmitOutputsDecisionModal: FC<SubmitOutputsDecisionModalProps> = ({
    decision,
    labName,
    isSubmitting,
    onClose,
    onConfirm,
}) => {
    // Adjusted during render rather than in an effect (React's documented pattern for deriving
    // state from a prop): it re-renders immediately with the new copy, before the browser paints,
    // so the modal never shows the previous decision's text for a frame.
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
