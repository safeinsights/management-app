'use client'

import { FC } from 'react'
import { Button, Group, Stack } from '@mantine/core'
import { IncompleteFieldsHint } from '@/components/incomplete-fields-hint'

interface ProposalFooterActionsProps {
    isSaving: boolean
    isValid: boolean
    onProceed: () => void
    proceedLabel: string
    onCancel?: () => void
    /** Labels of required fields still outstanding, named beside the disabled button. */
    missingFields?: string[]
}

export const ProposalFooterActions: FC<ProposalFooterActionsProps> = ({
    isSaving,
    isValid,
    onProceed,
    proceedLabel,
    onCancel,
    missingFields = [],
}) => {
    const showCancel = !!onCancel

    return (
        <Group mt="xs" justify={showCancel ? 'space-between' : 'flex-end'} align="flex-start" w="100%">
            {showCancel && (
                <Button type="button" variant="subtle" size="md" onClick={onCancel} disabled={isSaving}>
                    Cancel
                </Button>
            )}
            <Stack gap={4} align="flex-end">
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
                <IncompleteFieldsHint missing={missingFields} />
            </Stack>
        </Group>
    )
}
