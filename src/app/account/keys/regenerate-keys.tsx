'use client'

import { Button, Stack, Text, Group, Title, Paper, Divider, Modal } from '@mantine/core'
import { FC, useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { GenerateKeys } from './generate-keys'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { useOrgInfo } from '@/components/org-info'

export const RegenerateKeys: FC = () => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [displayGenerateKeys, setDisplayGenerateKeys] = useState(false)
    const { orgSlug } = useOrgInfo()

    const handleConfirmAndProceed = () => {
        closeModal()
        setDisplayGenerateKeys(true)
    }

    if (displayGenerateKeys) {
        return <GenerateKeys isRegenerating={true} />
    }

    return (
        <Paper p="xl" mx="sm" radius="sm" maw={900} my={{ base: '1rem', lg: 0 }}>
            <PageBreadcrumbs crumbs={[['Dashboard', `/reviewer/${orgSlug}/dashboard`], ['Reviewer Key']]} />
            <Title my="xxl">Reviewer key</Title>
            <Paper shadow="xs" p="xl">
                <Stack>
                    <Title size="xl">Reviewer key details</Title>
                    <Divider c="charcoal.1" />
                    <Stack>
                        <Text size="sm" fw={600}>
                            Reviewer key already exists
                        </Text>
                        <Text size="md" mb="xs">
                            You have already generated a reviewer key. For security reasons, SafeInsights does not store
                            or display it again.
                        </Text>
                        <Text size="sm" fw={600}>
                            Lost key?
                        </Text>

                        <Text size="md">If you have lost your reviewer key, you will need to generate a new one.</Text>
                        <Text size="md" c="red.9">
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
        </Paper>
    )
}

const GenerateNewKeyModal: FC<{
    onClose: () => void
    isOpen: boolean
    onConfirmAndClose: () => void
}> = ({ onClose, isOpen, onConfirmAndClose }) => {
    return (
        <Modal opened={isOpen} onClose={onClose} title="Confirm key reset">
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
        </Modal>
    )
}
