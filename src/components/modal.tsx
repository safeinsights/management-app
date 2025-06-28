import { Modal, ModalProps, useMantineTheme } from '@mantine/core'
import React from 'react'

interface AppModalProps extends Omit<ModalProps, 'opened'> {
    isOpen: boolean
    onClose: () => void
    children: React.ReactNode
    title: React.ReactNode
}

/**
 * A wrapper around Mantine's Modal component to promote reusability and consistent styling.
 */
export function AppModal({
    isOpen,
    onClose,
    children,
    title,
    size = 'lg',
    centered = true,
    closeOnClickOutside = true,
    trapFocus = true,
}: AppModalProps) {
    const theme = useMantineTheme()

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={title}
            size={size}
            centered={centered}
            closeOnClickOutside={closeOnClickOutside}
            trapFocus={trapFocus}
            closeButtonProps={{ size: 'md' }}
            styles={{
                header: {
                    padding: '0px 40px',
                    backgroundColor: theme.colors.grey[10],
                },
                body: {
                    padding: '40px 80px',
                },
                close: {
                    backgroundColor: theme.colors.charcoal[4],
                    color: 'white',
                    borderRadius: '32px',
                    padding: '4px',
                },
                title: {
                    fontWeight: 600,
                    fontSize: '18px',
                },
            }}
        >
            {children}
        </Modal>
    )
}
