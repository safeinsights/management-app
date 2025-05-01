import { Modal, ModalProps } from '@mantine/core'
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
    size = 'md',
    centered = false,
    closeOnClickOutside = false,
    trapFocus = true,
}: AppModalProps) {
    if (!isOpen) {
        return null
    }

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
                    backgroundColor: '#F1F3F5',
                },
                body: {
                    padding: '40px 80px',
                },
                close: {
                    backgroundColor: '#8C8C8C',
                    color: '#FFFFFF',
                    borderRadius: '32px',
                    padding: '4px',
                },
            }}
        >
            {children}
        </Modal>
    )
}
