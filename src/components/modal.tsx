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
    styles,
    ...rest
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
            styles={{
                header: {
                    padding: '0px 40px',
                    backgroundColor: theme.colors.grey[10],
                    ...styles?.header,
                },
                body: {
                    padding: '40px',
                    ...styles?.body,
                },
                close: {
                    backgroundColor: theme.colors.charcoal[4],
                    color: 'white',
                    borderRadius: '100%',
                    height: '16px',
                    width: '16px',
                    minHeight: '16px',
                    minWidth: '16px',
                    ...styles?.close,
                },
                title: {
                    fontSize: '20px',
                    fontWeight: 600,
                    ...styles?.title,
                },
            }}
            {...rest}
        >
            {children}
        </Modal>
    )
}
