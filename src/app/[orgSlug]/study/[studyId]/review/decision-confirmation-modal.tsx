import type { FC } from 'react'
import { Text } from '@mantine/core'
import { ReviewConfirmationModal } from '@/components/modals/review-confirmation-modal'
import type { Decision } from '@/lib/review-decision'

export type DecisionModalConfig = {
    title: string
    body: (labName: string) => string
    confirmLabel: string
    variant: 'default' | 'error'
}

export type DecisionModalContent = Record<Decision, DecisionModalConfig>

export const DECISION_MODAL_CONTENT: DecisionModalContent = {
    approve: {
        title: 'Approve proposal?',
        body: (lab) =>
            `Your approval and feedback will be sent to ${lab}. You will not be able to make changes after approving.`,
        confirmLabel: 'Approve proposal',
        variant: 'default',
    },
    'needs-clarification': {
        title: 'Request revision?',
        body: (lab) =>
            `Your feedback will be sent to ${lab} so they can update and resubmit. You'll be notified when the revised proposal is ready for review.`,
        confirmLabel: 'Request revision',
        variant: 'default',
    },
    reject: {
        title: 'Decline proposal?',
        body: (lab) =>
            `Your decision and feedback will be sent to ${lab}. Declining ends this study and cannot be undone.`,
        confirmLabel: 'Decline and end study',
        variant: 'error',
    },
}

// Code review offers only the first two, but the map stays total over Decision (OTTER-650 removed
// reject from code review) so a future third option cannot fall through to proposal copy.
export const CODE_DECISION_MODAL_CONTENT: DecisionModalContent = {
    approve: {
        title: 'Approve code?',
        body: (lab) =>
            `Your approval and feedback will be sent to ${lab}. You will not be able to make changes after approving.`,
        confirmLabel: 'Approve code',
        variant: 'default',
    },
    'needs-clarification': {
        title: 'Request revision?',
        body: (lab) =>
            `Your feedback will be sent to ${lab} so they can update their code and resubmit. You'll be notified when the revised code is ready for review.`,
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

type DecisionConfirmationModalProps = {
    decision: Decision | null
    labName: string
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
    /** The proposal copy by default; the code review passes its own. */
    content?: DecisionModalContent
}

export const DecisionConfirmationModal: FC<DecisionConfirmationModalProps> = ({
    decision,
    labName,
    isOpen,
    onClose,
    onConfirm,
    isPending,
    content = DECISION_MODAL_CONTENT,
}) => {
    if (!decision) return null

    const config = content[decision]

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
