'use client'

import { FC } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { useRouter } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { RegenerateKeyView } from './regenerate-key-view'

type RegenerateKeyProps = {
    /** Date the current key was generated, preformatted server-side (MMM DD, YYYY). */
    generatedOn: string
}

export const RegenerateKey: FC<RegenerateKeyProps> = ({ generatedOn }) => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const router = useRouter()

    const handleConfirmAndProceed = () => {
        closeModal()
        router.push(Routes.accountKeys)
    }

    return (
        <RegenerateKeyView
            generatedOn={generatedOn}
            isModalOpen={isModalOpen}
            onOpenModal={openModal}
            onCloseModal={closeModal}
            onConfirmGenerate={handleConfirmAndProceed}
        />
    )
}
