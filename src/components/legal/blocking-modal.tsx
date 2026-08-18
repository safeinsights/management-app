'use client'

import { Modal } from '@mantine/core'
import type { FC, ReactNode } from 'react'

type Props = {
    title: string
    children: ReactNode
}

/**
 * Modal shell for the legal gates.
 *
 * Shared for one reason: dismissing one of these and carrying on is the thing they exist to prevent,
 * so the three props that make that impossible must not drift apart between them. Each gate still
 * offers its own way out — the alternative to agreeing cannot be closing the tab.
 */
export const BlockingModal: FC<Props> = ({ title, children }) => (
    <Modal
        opened
        onClose={() => {}}
        title={title}
        size="lg"
        centered
        withCloseButton={false}
        closeOnEscape={false}
        closeOnClickOutside={false}
    >
        {children}
    </Modal>
)
