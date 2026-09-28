import { type FC, type ReactNode } from 'react'
import { Button, Group, Stack } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'

interface ReviewConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
    title: string
    confirmLabel: string
    variant?: 'default' | 'error'
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
    const confirmVariant = variant === 'error' ? 'error' : 'filled'

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
                    <Button variant={confirmVariant} onClick={onConfirm} loading={isPending}>
                        {confirmLabel}
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
