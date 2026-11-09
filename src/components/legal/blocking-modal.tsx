'use client'

import { Alert, Modal, type ModalProps } from '@mantine/core'
import type { FC, ReactNode } from 'react'

type Props = {
    title: ReactNode
    size?: ModalProps['size']
    children: ReactNode
}

export const AcknowledgementError: FC<{ error: string | null }> = ({ error }) => {
    if (!error) return null

    return <Alert color="red">{error}</Alert>
}

// Shared so the three props that make dismissal impossible cannot drift apart between the gates.
// The study and ropa/dopa gates supply their own way out; the tos/pn gate has none, per the UX review.
export const BlockingModal: FC<Props> = ({ title, size = 'lg', children }) => (
    <Modal
        opened
        onClose={() => {}}
        title={title}
        size={size}
        centered
        withCloseButton={false}
        closeOnEscape={false}
        closeOnClickOutside={false}
    >
        {children}
    </Modal>
)
