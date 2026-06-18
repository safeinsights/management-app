'use client'

import { FC } from 'react'
import { Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'

// Presentational reviewer-key screen. It owns the breadcrumbs + "Reviewer key details" card
// (lost-key copy, destructive note, regenerate button) and the confirm modal. Kept in its OWN
// file — free of useSession (Clerk), useRouter and Routes navigation — so it renders in
// isolation (e.g. Ladle). The RegenerateKey container (./regenerate-key) derives the dashboard
// crumb from the session and wires the modal/navigation handlers.
export type RegenerateKeyViewProps = {
    /** Dashboard breadcrumb target, derived from the session by the container. */
    dashboardHref: string
    isModalOpen: boolean
    onOpenModal: () => void
    onCloseModal: () => void
    /** Confirms the destructive regenerate flow (navigates in the container). */
    onConfirmGenerate: () => void
}

export const RegenerateKeyView: FC<RegenerateKeyViewProps> = ({
    dashboardHref,
    isModalOpen,
    onOpenModal,
    onCloseModal,
    onConfirmGenerate,
}) => {
    return (
        <Stack p="xl" mx="sm">
            <PageBreadcrumbs crumbs={[['Dashboard', dashboardHref], ['Reviewer Key']]} />
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
                            onClick={onOpenModal}
                            size="sm"
                            styles={{ label: { whiteSpace: 'normal', wordBreak: 'break-word' } }}
                        >
                            Lost key? Generate a new one
                        </Button>
                    </Group>
                </Stack>
            </Paper>
            <GenerateNewKeyModal onClose={onCloseModal} isOpen={isModalOpen} onConfirmAndClose={onConfirmGenerate} />
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
