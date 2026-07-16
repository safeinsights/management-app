'use client'

import { FC } from 'react'
import { Button, Divider, Group, Stack, Text, Title } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'

// Presentational security-key screen; kept navigation-free so it renders in isolation (e.g. Ladle).
export type RegenerateKeyViewProps = {
    /** Date the current key was generated, preformatted (MMM DD, YYYY). */
    generatedOn: string
    isModalOpen: boolean
    onOpenModal: () => void
    onCloseModal: () => void
    /** Confirms the destructive regenerate flow (navigates in the container). */
    onConfirmGenerate: () => void
}

const DIVIDER_COLOR = 'charcoal.1'

export const RegenerateKeyView: FC<RegenerateKeyViewProps> = ({
    generatedOn,
    isModalOpen,
    onOpenModal,
    onCloseModal,
    onConfirmGenerate,
}) => {
    return (
        <Stack p="xl" mx="sm" gap={40}>
            <Title fz={34}>Security key</Title>

            <Stack gap={16}>
                <Title order={2} fz={20}>
                    Existing security key
                </Title>
                <Divider c={DIVIDER_COLOR} />
                <Text fz={16}>
                    You generated a security key on {generatedOn}. For security reasons, SafeInsights does not store or
                    display it again.
                </Text>
            </Stack>

            <Stack gap={16}>
                <Title order={2} fz={20}>
                    Lost access to your key?
                </Title>
                <Divider c={DIVIDER_COLOR} />
                <Text fz={16}>
                    Outputs can be accessed only with a security key. If you have lost yours, ask another member of your
                    organization to access them with their key. To restore your own access going forward, you can
                    generate a new key below.{' '}
                    <Text component="b" fw={700} inherit>
                        A new key cannot decrypt your current outputs. It works only for outputs encrypted after you
                        generate it.
                    </Text>
                </Text>
                <Group>
                    <Button onClick={onOpenModal}>Generate new key</Button>
                </Group>
            </Stack>

            <ConfirmKeyResetModal onClose={onCloseModal} isOpen={isModalOpen} onConfirmAndClose={onConfirmGenerate} />
        </Stack>
    )
}

const ConfirmKeyResetModal: FC<{
    onClose: () => void
    isOpen: boolean
    onConfirmAndClose: () => void
}> = ({ onClose, isOpen, onConfirmAndClose }) => {
    return (
        <AppModal isOpen={isOpen} onClose={onClose} title="Confirm key reset">
            <Stack>
                <Text fz={16} mb="md">
                    A new key cannot decrypt your current outputs. If you no longer have your key and no one in your
                    organization can access them, those outputs will be lost. This action cannot be undone.
                </Text>
                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button color="red.9" onClick={onConfirmAndClose}>
                        Generate new key
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
