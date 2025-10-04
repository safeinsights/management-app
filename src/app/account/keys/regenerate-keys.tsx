'use client'

import { AppModal } from '@/components/modal'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { useSession } from '@/hooks/session'
import { getEnclaveOrg } from '@/lib/types'
import { Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useRouter } from 'next/navigation'
import { FC } from 'react'

export const RegenerateKeys: FC = () => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const { session } = useSession()
    const enclaveOrg = session ? getEnclaveOrg(session) : null
    const router = useRouter()

    const handleConfirmAndProceed = () => {
        closeModal()
        router.push('/account/keys')
    }

    return (
        <Stack p="xl" mx="sm">
            <PageBreadcrumbs
                crumbs={[['Dashboard', enclaveOrg ? `/${enclaveOrg.slug}/dashboard` : '/dashboard'], ['Reviewer Key']]}
            />
            <Title my="xxl">Reviewer key</Title>
            <Paper shadow="xs" p="xxl">
                <Stack>
                    <Title size="xl">Reviewer key details</Title>
                    <Divider c="charcoal.1" />
                    <Stack gap={8}>
                        <Text size="sm" fw={600}>
                            Reviewer key already exists
                        </Text>
                        <Text size="md" mb={16}>
                            You have already generated a reviewer key. For security reasons, SafeInsights does not store
                            or display it again.
                        </Text>
                        <Text size="sm" fw={600}>
                            Lost key?
                        </Text>

                        <Text size="md">If you have lost your reviewer key, you will need to generate a new one.</Text>
                        <Text size="md" c="red.9" mb={8}>
                            Note: If you generate a new reviewer key, you will no longer have access to any study
                            results associated with your previous key. This action cannot be undone.
                        </Text>
                    </Stack>
                    <Group>
                        <Button
                            onClick={() => openModal()}
                            size="sm"
                            styles={{ label: { whiteSpace: 'normal', wordBreak: 'break-word' } }}
                        >
                            Lost key? Generate a new one
                        </Button>
                    </Group>
                </Stack>
            </Paper>
            <GenerateNewKeyModal
                onClose={closeModal}
                isOpen={isModalOpen}
                onConfirmAndClose={handleConfirmAndProceed}
            />
        </Stack>
    )
}

const GenerateNewKeyModal: FC<{
    onClose: () => void
    isOpen: boolean
    onConfirmAndClose: () => void
}> = ({ onClose, isOpen, onConfirmAndClose }) => {
    return (
        <AppModal isOpen={isOpen} onClose={onClose} title="Confirm key reset">
            <Stack>
                <Text size="md">
                    Generating a new reviewer key will permanently remove access to study results tied to your old key.
                </Text>
                <Text size="md" mb="md">
                    This action cannot be undone.
                </Text>
                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirmAndClose}>Generate new key</Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
