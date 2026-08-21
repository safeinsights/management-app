import { type FC } from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'

interface SubmitConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isSubmitting: boolean
    title: string
    body: string
    confirmLabel: string
    /**
     * Replaces `confirmLabel` while the submission is in flight. Mantine keeps the label under its
     * spinner, so without this the button reads as though nothing has happened yet.
     */
    confirmLoadingLabel?: string
}

export const SubmitConfirmationModal: FC<SubmitConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isSubmitting,
    title,
    body,
    confirmLabel,
    confirmLoadingLabel,
}) => (
    // Every dismissal route closes with Cancel, not just the button: leaving the X, Escape and
    // outside-click live while Cancel is disabled lets the user dismiss a submission that is still
    // running, with no way to tell whether dismissing cancelled it (it does not).
    <AppModal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        closeButtonProps={{ 'aria-label': 'Close' }}
        withCloseButton={!isSubmitting}
        closeOnEscape={!isSubmitting}
        closeOnClickOutside={!isSubmitting}
    >
        <Stack gap="xl">
            <Text size="md">{body}</Text>
            <Group>
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button variant="primary" onClick={onConfirm} loading={isSubmitting}>
                    {isSubmitting && confirmLoadingLabel ? confirmLoadingLabel : confirmLabel}
                </Button>
            </Group>
        </Stack>
    </AppModal>
)
