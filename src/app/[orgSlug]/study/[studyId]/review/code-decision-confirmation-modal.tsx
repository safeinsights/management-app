import type { FC } from 'react'
import { Text } from '@mantine/core'
import { ReviewConfirmationModal } from '@/components/modals/review-confirmation-modal'
import type { Decision } from '@/lib/review-decision'

type CodeDecisionModalConfig = {
    title: string
    body: (labName: string) => string
    confirmLabel: string
    variant: 'default' | 'error'
}

// Keyed on the full Decision union so the map stays total; the code review form only offers the
// first two (OTTER-650 removed reject from code review).
export const CODE_DECISION_MODAL_CONTENT: Record<Decision, CodeDecisionModalConfig> = {
    approve: {
        title: 'Approve code?',
        body: (lab) =>
            `Your approval and feedback will be sent to ${lab}, and the code will run in the secure enclave. You will not be able to make changes after approving.`,
        confirmLabel: 'Approve code',
        variant: 'default',
    },
    'needs-clarification': {
        title: 'Request revision?',
        body: (lab) =>
            `Your feedback will be sent to ${lab} so they can update and resubmit their code. You'll be notified when the revised code is ready for review.`,
        confirmLabel: 'Request revision',
        variant: 'default',
    },
    reject: {
        title: 'Decline code?',
        body: (lab) =>
            `Your decision and feedback will be sent to ${lab}. Declining ends this study and cannot be undone.`,
        confirmLabel: 'Decline and end study',
        variant: 'error',
    },
}

type CodeDecisionConfirmationModalProps = {
    decision: Decision | null
    labName: string
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
}

export const CodeDecisionConfirmationModal: FC<CodeDecisionConfirmationModalProps> = ({
    decision,
    labName,
    isOpen,
    onClose,
    onConfirm,
    isPending,
}) => {
    if (!decision) return null

    const config = CODE_DECISION_MODAL_CONTENT[decision]

    return (
        <ReviewConfirmationModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            isPending={isPending}
            title={config.title}
            confirmLabel={config.confirmLabel}
            variant={config.variant}
        >
            <Text size="md">{config.body(labName)}</Text>
        </ReviewConfirmationModal>
    )
}
