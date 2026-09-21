'use client'

import { FC } from 'react'
import { Button, Group } from '@mantine/core'

interface ProposalFooterActionsProps {
    isSaving: boolean
    onProceed: () => void
    proceedLabel: string
}

export const ProposalFooterActions: FC<ProposalFooterActionsProps> = ({ isSaving, onProceed, proceedLabel }) => (
    <Group mt="xs" justify="flex-end" align="flex-start" w="100%">
        {/* Never disabled on validity: clicking it is what surfaces the errors. */}
        <Button type="button" size="md" variant="filled" disabled={isSaving} loading={isSaving} onClick={onProceed}>
            {proceedLabel}
        </Button>
    </Group>
)
