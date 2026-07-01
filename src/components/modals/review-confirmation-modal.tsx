import { type FC, type ReactNode } from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'

interface ReviewConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
    title: string
    confirmLabel: string
    variant?: 'default' | 'destructive'
    children: ReactNode
}

export const ReviewConfirmationModal: FC<ReviewConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isPending,
    title,
    confirmLabel,
    variant = 'default',
    children,
}) => {
    const isDestructive = variant === 'destructive'
    return (
        <AppModal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size={720}
            closeOnClickOutside={!isPending}
            closeOnEscape={!isPending}
            withCloseButton={!isPending}
        >
            <Stack>
                {children}
                <Group>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button color={isDestructive ? 'red' : undefined} onClick={onConfirm} loading={isPending}>
                        {confirmLabel}
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}

export const REJECTION_WARNING = (
    <Text size="md" fw={600} c="red.9">
        Rejection: This is intended as a last resort due to major, unresolvable issues and will end this study. This
        action cannot be undone.
    </Text>
)
