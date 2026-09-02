import type { FC } from 'react'
import { Text } from '@mantine/core'
import { ReviewConfirmationModal } from '@/components/modals/review-confirmation-modal'
import type { Decision } from '@/lib/review-decision'

type DecisionModalConfig = {
    title: string
    body: (labName: string) => string
    confirmLabel: string
    variant: 'default' | 'danger'
}

export const DECISION_MODAL_CONTENT: Record<Decision, DecisionModalConfig> = {
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
        variant: 'danger',
    },
}

type DecisionConfirmationModalProps = {
    decision: Decision | null
    labName: string
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
}

export const DecisionConfirmationModal: FC<DecisionConfirmationModalProps> = ({
    decision,
    labName,
    isOpen,
    onClose,
    onConfirm,
    isPending,
}) => {
    if (!decision) return null

    const config = DECISION_MODAL_CONTENT[decision]

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
