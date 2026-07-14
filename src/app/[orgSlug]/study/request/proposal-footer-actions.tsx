'use client'

import { FC } from 'react'
import { Button, Group } from '@mantine/core'

interface ProposalFooterActionsProps {
    isSaving: boolean
    isValid: boolean
    onProceed: () => void
    proceedLabel: string
    onCancel?: () => void
}

export const ProposalFooterActions: FC<ProposalFooterActionsProps> = ({
    isSaving,
    isValid,
    onProceed,
    proceedLabel,
    onCancel,
}) => {
    const showCancel = !!onCancel

    return (
        <Group mt="xs" justify={showCancel ? 'space-between' : 'flex-end'} w="100%">
            {showCancel && (
                <Button type="button" variant="subtle" size="md" onClick={onCancel} disabled={isSaving}>
                    Cancel
                </Button>
            )}
            <Button
                type="button"
                size="md"
                variant="primary"
                disabled={!isValid || isSaving}
                loading={isSaving}
                onClick={onProceed}
            >
                {proceedLabel}
            </Button>
        </Group>
    )
}
