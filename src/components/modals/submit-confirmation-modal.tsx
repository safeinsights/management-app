import { type FC, type ReactNode } from 'react'
import { Button, Group, Loader, type ModalProps, Stack, Text } from '@mantine/core'
import { AppModal, CompactModalTitle } from '@/components/modals/app-modal'

interface SubmitConfirmationModalProps extends Pick<ModalProps, 'size' | 'centered' | 'yOffset'> {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isSubmitting: boolean
    title: string
    body: ReactNode
    confirmLabel: string
    /** Omit to keep Mantine's default treatment, which covers the label with a loader overlay. */
    confirmLoadingLabel?: string
    confirmVariant?: 'filled' | 'error'
    /** The 440px Confirm/md variant's type: 16px bold title over a 14px body (OTTER-955). */
    compact?: boolean
}

const ModalTitle: FC<{ title: string; compact: boolean }> = ({ title, compact }) => {
    if (!compact) return title

    return <CompactModalTitle>{title}</CompactModalTitle>
}

// With a loading label the busy state uses `disabled` plus a `leftSection` spinner rather than
// Mantine's `loading`, which overlays the Loader on the label (OTTER-691).
const ConfirmButton: FC<{
    onConfirm: () => void
    isSubmitting: boolean
    confirmLabel: string
    confirmLoadingLabel?: string
    variant: 'filled' | 'error'
}> = ({ onConfirm, isSubmitting, confirmLabel, confirmLoadingLabel, variant }) => {
    if (!confirmLoadingLabel) {
        return (
            <Button variant={variant} onClick={onConfirm} loading={isSubmitting}>
                {confirmLabel}
            </Button>
        )
    }

    return (
        <Button
            variant={variant}
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
    confirmVariant = 'filled',
    compact = false,
    ...placement
}) => (
    // X, Escape and outside-click close with Cancel too: left live while Cancel is disabled they
    // would dismiss a running submission with no sign of whether it was cancelled.
    <AppModal
        isOpen={isOpen}
        onClose={onClose}
        title={<ModalTitle title={title} compact={compact} />}
        withCloseButton={!isSubmitting}
        closeOnEscape={!isSubmitting}
        closeOnClickOutside={!isSubmitting}
        {...placement}
    >
        <Stack gap="xl">
            <Text size={compact ? 'sm' : 'md'}>{body}</Text>
            <Group>
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <ConfirmButton
                    onConfirm={onConfirm}
                    isSubmitting={isSubmitting}
                    confirmLabel={confirmLabel}
                    confirmLoadingLabel={confirmLoadingLabel}
                    variant={confirmVariant}
                />
            </Group>
        </Stack>
    </AppModal>
)
