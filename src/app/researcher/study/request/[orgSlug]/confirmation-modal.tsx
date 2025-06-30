import { modals } from '@mantine/modals'
import { Text, Stack } from '@mantine/core'

export const openConfirmSubmissionModal = (onConfirm: () => void, isLoading = false) => {
    modals.openConfirmModal({
        title: 'Confirm proposal submission',
        closeOnClickOutside: !isLoading,
        closeButtonProps: {
            disabled: isLoading,
            'aria-label': 'Close modal',
        },
        styles: {
            body: {
                padding: '40px',
            },
            title: {
                fontWeight: 'bold',
            },
        },
        children: (
            <Stack>
                <Text size="sm">
                    You&apos;re about to submit your study proposal for review. Once submitted, you won&apos;t be able
                    to make further edits.
                </Text>
                <Text size="sm">Do you want to proceed?</Text>
            </Stack>
        ),
        labels: {
            confirm: 'Yes, submit proposal',
            cancel: 'No, continue editing',
        },
        cancelProps: {
            variant: 'outline',
        },
        groupProps: {
            justify: 'flex-start',
            mt: 'xl',
        },
        onConfirm,
        closeOnConfirm: !isLoading,
        closeOnCancel: !isLoading,
    })
}
