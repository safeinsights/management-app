import { Modal, ModalProps, useMantineTheme } from '@mantine/core'
import React, { useEffect } from 'react'
import { closeOpenLinkCard, useIsLinkCardOpen } from '@/components/link-hover-card/link-card-interactions'

interface AppModalProps extends Omit<ModalProps, 'opened'> {
    isOpen: boolean
    onClose: () => void
    children: React.ReactNode
    title: React.ReactNode
}

/**
 * A link card inside the modal takes the first Escape, since Mantine's window listener would close
 * both. One left open under the overlay is closed instead, so it cannot take the modal's Escape.
 */
function useLinkCardTakesEscape(isOpen: boolean) {
    useEffect(() => {
        if (isOpen) closeOpenLinkCard()
    }, [isOpen])

    return useIsLinkCardOpen()
}

export function AppModal({
    isOpen,
    onClose,
    children,
    title,
    size = 'lg',
    centered = true,
    closeOnClickOutside = true,
    closeOnEscape = true,
    trapFocus = true,
    styles,
    closeButtonProps,
    ...rest
}: AppModalProps) {
    const theme = useMantineTheme()
    const linkCardTakesEscape = useLinkCardTakesEscape(isOpen)

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={title}
            size={size}
            centered={centered}
            closeOnClickOutside={closeOnClickOutside}
            closeOnEscape={closeOnEscape && !linkCardTakesEscape}
            trapFocus={trapFocus}
            styles={{
                header: {
                    padding: '0px 40px',
                    backgroundColor: theme.colors.charcoal[0],
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
            // Mantine's CloseButton ships with no accessible name.
            closeButtonProps={{ 'aria-label': 'Close', ...closeButtonProps }}
            {...rest}
        >
            {children}
        </Modal>
    )
}
