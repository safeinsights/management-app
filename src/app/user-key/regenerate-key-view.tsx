'use client'

import { FC } from 'react'
import { Button, Divider, Group, Stack, Text, Title } from '@mantine/core'
import { LocalDateTime } from '@/components/local-date-time'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { PageHeader } from '@/components/page-header'
import { fontWeight } from '@/theme/tokens'
import { KEY_RESET_MODAL_BODY, KEY_RESET_MODAL_TITLE, KEY_RESET_WARNING } from './copy'

export type RegenerateKeyViewProps = {
    generatedOn: Date | string
    isModalOpen: boolean
    onOpenModal: () => void
    onCloseModal: () => void
    onConfirmGenerate: () => void
}

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
                <Title order={2} fz="xl">
                    Existing security key
                </Title>
                <Divider />
                <Text fz="md">
                    You generated a security key
                    <LocalDateTime value={generatedOn} prefix=" on " />. For security reasons, SafeInsights does not
                    store or display it again. You need this key to access your outputs in every organization you belong
                    to.
                </Text>
            </Stack>

            <Stack gap="md">
                <Title order={2} fz="xl">
                    Lost access to your key?
                </Title>
                <Divider />
                <Text fz="md">
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

            <SubmitConfirmationModal
                isOpen={isModalOpen}
                onClose={onCloseModal}
                onConfirm={onConfirmGenerate}
                title={KEY_RESET_MODAL_TITLE}
                body={KEY_RESET_MODAL_BODY}
                confirmLabel="Generate new key"
                variant="error"
            />
        </Stack>
    )
}
