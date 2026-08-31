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
    /**
     * Replaces `confirmLabel` while the submission is in flight, shown beside a spinner.
     *
     * Omit it to keep Mantine's default loading treatment, which covers the label with a centered
     * loader overlay and leaves the button reading as a bare spinner.
     */
    confirmLoadingLabel?: string
}

/**
 * The confirm button.
 *
 * With a loading label it drives the busy state through `disabled` plus a `leftSection` spinner
 * rather than Mantine's `loading`. `loading` renders the Loader as a centered overlay *on top of*
 * the label, so the word would be in the DOM and invisible on screen; the design (OTTER-691) shows
 * the spinner and the word side by side. `disabled` gives the same double-submit protection,
 * because `loading` sets the disabled attribute anyway.
 */
const ConfirmButton: FC<{
    onConfirm: () => void
    isSubmitting: boolean
    confirmLabel: string
    confirmLoadingLabel?: string
}> = ({ onConfirm, isSubmitting, confirmLabel, confirmLoadingLabel }) => {
    if (!confirmLoadingLabel) {
        return (
            <Button variant="primary" onClick={onConfirm} loading={isSubmitting}>
                {confirmLabel}
            </Button>
        )
    }

    return (
        <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isSubmitting}
            // No explicit color: the loader inherits the button text color, which is what
            // greys it out in step with the label while the button is disabled.
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
