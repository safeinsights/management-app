import { type FC } from 'react'
import { Button, Group, Loader, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'

interface SubmitConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isSubmitting: boolean
    title: string
    body: string
    confirmLabel: string
    /** Omit to keep Mantine's default treatment, which covers the label with a loader overlay. */
    confirmLoadingLabel?: string
}

// With a loading label the busy state uses `disabled` plus a `leftSection` spinner rather than
// Mantine's `loading`, which overlays the Loader on the label (OTTER-691).
const ConfirmButton: FC<{
    onConfirm: () => void
    isSubmitting: boolean
    confirmLabel: string
    confirmLoadingLabel?: string
}> = ({ onConfirm, isSubmitting, confirmLabel, confirmLoadingLabel }) => {
    if (!confirmLoadingLabel) {
        return (
            <Button variant="filled" onClick={onConfirm} loading={isSubmitting}>
                {confirmLabel}
            </Button>
        )
    }

    return (
        <Button
            variant="filled"
            onClick={onConfirm}
            disabled={isSubmitting}
            // No explicit color, so the loader greys out in step with the label.
            leftSection={isSubmitting ? <Loader size={14} /> : undefined}
        >
            {isSubmitting ? confirmLoadingLabel : confirmLabel}
        </Button>
    )
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
    // X, Escape and outside-click close with Cancel too: left live while Cancel is disabled they
    // would dismiss a running submission with no sign of whether it was cancelled.
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
                <ConfirmButton
                    onConfirm={onConfirm}
                    isSubmitting={isSubmitting}
                    confirmLabel={confirmLabel}
                    confirmLoadingLabel={confirmLoadingLabel}
                />
            </Group>
        </Stack>
    </AppModal>
)
