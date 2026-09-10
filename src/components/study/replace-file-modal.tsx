'use client'

import type { FC } from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import type { DuplicateResolution } from '@/hooks/use-upload-queue'

const MODAL_TITLE = 'Replace existing file?'

type ReplaceFileModalProps = {
    /** The arriving file whose name collides, or null when nothing is being asked about. */
    file: File | null
    onResolve: (resolution: DuplicateResolution) => void
}

/**
 * Asked before a colliding upload lands (OTTER-693). Replace is destructive and Keep both is not,
 * so Replace carries the red treatment and Cancel sits apart from the two actions.
 */
export const ReplaceFileModal: FC<ReplaceFileModalProps> = ({ file, onResolve }) => (
    <AppModal
        isOpen={file !== null}
        onClose={() => onResolve('cancel')}
        title={MODAL_TITLE}
        closeButtonProps={{ 'aria-label': 'Close' }}
    >
        <Stack gap="xl">
            <Text size="md">
                A file named{' '}
                <Text span inherit fw={700}>
                    {file?.name}
                </Text>{' '}
                already exists in SafeInsights. Replacing this file will overwrite and permanently delete the current
                version
            </Text>
            <Group justify="space-between">
                <Button variant="subtle" onClick={() => onResolve('cancel')}>
                    Cancel
                </Button>
                <Group gap="sm">
                    <Button variant="outline" onClick={() => onResolve('keepBoth')}>
                        Keep both
                    </Button>
                    <Button color="red.7" onClick={() => onResolve('replace')}>
                        Replace
                    </Button>
                </Group>
            </Group>
        </Stack>
    </AppModal>
)
