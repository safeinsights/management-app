'use client'

import { FC } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/session'
import { Routes } from '@/lib/routes'
import { getEnclaveOrg } from '@/lib/types'
import { RegenerateKeyView } from './regenerate-key-view'

// Data container: derives the dashboard crumb from the session and wires the modal + the
// destructive regenerate navigation, then renders the presentational RegenerateKeyView.
export const RegenerateKey: FC = () => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const { session } = useSession()
    const enclaveOrg = session ? getEnclaveOrg(session) : null
    const router = useRouter()

    const handleConfirmAndProceed = () => {
        closeModal()
        router.push(Routes.accountKeys)
    }

    return (
        <RegenerateKeyView
            dashboardHref={enclaveOrg ? `/${enclaveOrg.slug}/dashboard` : '/dashboard'}
            isModalOpen={isModalOpen}
            onOpenModal={openModal}
            onCloseModal={closeModal}
            onConfirmGenerate={handleConfirmAndProceed}
        />
    )
}
