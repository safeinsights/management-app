import React from 'react'
import { Text, Button, Group, Stack, Modal } from '@mantine/core'

interface ConfirmationModalProps {
    opened: boolean
    onClose: () => void
    onConfirm: () => void
    isLoading?: boolean
}

export const ConfirmSubmissionModal: React.FC<ConfirmationModalProps> = ({
    opened,
    onClose,
    onConfirm,
    isLoading = false,
}) => {
    return (
        <Modal
            opened={opened}
            onClose={() => !isLoading && onClose()}
            title="Confirm proposal submission"
            closeButtonProps={{
                'aria-label': 'Close modal',
                disabled: isLoading,
            }}
            styles={{
                body: { padding: '40px' },
            }}
            withCloseButton
        >
            <Stack>
                <Text size="sm">
                    You&apos;re about to submit your study proposal for review. Once submitted, you won&apos;t be able
                    to make further edits.
                </Text>
                <Text size="sm">Do you want to proceed?</Text>
            </Stack>
            <Group justify="flex-start" mt="xl">
                <Button variant="outline" onClick={onClose} disabled={isLoading}>
                    No, continue editing
                </Button>
                <Button variant="filled" onClick={onConfirm} loading={isLoading}>
                    Yes, submit proposal
                </Button>
            </Group>
        </Modal>
    )
}
