'use client'

import { Modal } from '@mantine/core'
import type { FC, ReactNode } from 'react'

type Props = {
    title: string
    children: ReactNode
}

// Shared so the three props that make dismissal impossible cannot drift apart between the gates.
// Each gate supplies its own way out: the alternative to agreeing must not be closing the tab.
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
