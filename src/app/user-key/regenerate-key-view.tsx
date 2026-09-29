'use client'

import { FC } from 'react'
import { Button, Divider, Group, Stack, Text, Title } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { PageHeader } from '@/components/page-header'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { KEY_RESET_CONFIRM_COLOR, KEY_RESET_MODAL_BODY, KEY_RESET_MODAL_TITLE, KEY_RESET_WARNING } from './copy'

export type RegenerateKeyViewProps = {
    generatedOn: string
    isModalOpen: boolean
    onOpenModal: () => void
    onCloseModal: () => void
    onConfirmGenerate: () => void
}

const DIVIDER_COLOR = semanticColor('border.default')

export const RegenerateKeyView: FC<RegenerateKeyViewProps> = ({
    generatedOn,
    isModalOpen,
    onOpenModal,
    onCloseModal,
    onConfirmGenerate,
}) => {
    return (
        <Stack p="xl" mx="sm" gap="xxl">
            <PageHeader title="Security key" />

            <Stack gap="md">
                <Title order={2} fz={20}>
                    Existing security key
                </Title>
                <Divider c={DIVIDER_COLOR} />
                <Text fz={16}>
                    You generated a security key on {generatedOn}. For security reasons, SafeInsights does not store or
                    display it again. You need this key to access your outputs in every organization you belong to.
                </Text>
            </Stack>

            <Stack gap="md">
                <Title order={2} fz={20}>
                    Lost access to your key?
                </Title>
                <Divider c={DIVIDER_COLOR} />
                <Text fz={16}>
                    Outputs can be accessed only with a security key. If you have lost yours, ask another member of your
                    organization to access them with their key. To restore your own access going forward, you can
                    generate a new key below.{' '}
                    <Text component="b" fw={fontWeight.bold} inherit>
                        {KEY_RESET_WARNING}
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
        <AppModal isOpen={isOpen} onClose={onClose} title={KEY_RESET_MODAL_TITLE}>
            <Stack>
                <Text fz={16} mb="md">
                    {KEY_RESET_MODAL_BODY}
                </Text>
                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button color={KEY_RESET_CONFIRM_COLOR} onClick={onConfirmAndClose}>
                        Generate new key
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
