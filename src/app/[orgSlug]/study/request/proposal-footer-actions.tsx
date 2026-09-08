'use client'

import { FC } from 'react'
import { Button, Group } from '@mantine/core'

interface ProposalFooterActionsProps {
    isSaving: boolean
    onProceed: () => void
    proceedLabel: string
    onCancel?: () => void
    cancelLabel?: string
    cancelVariant?: 'subtle' | 'outline'
}

export const ProposalFooterActions: FC<ProposalFooterActionsProps> = ({
    isSaving,
    onProceed,
    proceedLabel,
    onCancel,
    cancelLabel = 'Cancel',
    cancelVariant = 'subtle',
}) => {
    const showCancel = !!onCancel

    return (
        <Group mt="xs" justify={showCancel ? 'space-between' : 'flex-end'} align="flex-start" w="100%">
            {showCancel && (
                <Button type="button" variant={cancelVariant} size="md" onClick={onCancel} disabled={isSaving}>
                    {cancelLabel}
                </Button>
            )}
            {/* Never disabled on validity: clicking it is what surfaces the errors. */}
            <Button type="button" size="md" variant="filled" disabled={isSaving} loading={isSaving} onClick={onProceed}>
                {proceedLabel}
            </Button>
        </Group>
    )
}
