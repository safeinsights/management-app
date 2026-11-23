import { type FC, type ReactNode } from 'react'
import { Button, Group, Loader, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'

export type ConfirmVariant = 'default' | 'error'

interface SubmitConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isSubmitting: boolean
    title: string
    body: ReactNode
    confirmLabel: string
    /** Omit to keep Mantine's default treatment, which covers the label with a loader overlay. */
    confirmLoadingLabel?: string
    variant?: ConfirmVariant
}

// With a loading label the busy state uses `disabled` plus a `leftSection` spinner rather than
// Mantine's `loading`, which overlays the Loader on the label (OTTER-691).
const ConfirmButton: FC<{
    onConfirm: () => void
    isSubmitting: boolean
    confirmLabel: string
    confirmLoadingLabel?: string
    variant: ConfirmVariant
}> = ({ onConfirm, isSubmitting, confirmLabel, confirmLoadingLabel, variant }) => {
    const buttonVariant = variant === 'error' ? 'error' : 'filled'

    if (!confirmLoadingLabel) {
        return (
            <Button variant={buttonVariant} onClick={onConfirm} loading={isSubmitting}>
                {confirmLabel}
            </Button>
        )
    }

    return (
        <Button
            variant={buttonVariant}
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
    variant = 'default',
}) => (
    // X, Escape and outside-click close with Cancel too: left live while Cancel is disabled they
    // would dismiss a running submission with no sign of whether it was cancelled.
    <AppModal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        size="md"
        centered={false}
        yOffset="25dvh"
        withCloseButton={!isSubmitting}
        closeOnEscape={!isSubmitting}
        closeOnClickOutside={!isSubmitting}
    >
        <Stack gap="md">
            <Text size="sm">{body}</Text>
            <Group gap="sm">
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <ConfirmButton
                    onConfirm={onConfirm}
                    isSubmitting={isSubmitting}
                    confirmLabel={confirmLabel}
                    confirmLoadingLabel={confirmLoadingLabel}
                    variant={variant}
                />
            </Group>
        </Stack>
    </AppModal>
)
