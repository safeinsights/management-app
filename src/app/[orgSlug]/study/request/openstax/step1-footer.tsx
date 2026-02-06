'use client'

import { FC } from 'react'
import { Button, Group } from '@mantine/core'

interface Step1FooterProps {
    isSaving: boolean
    isStep1Valid: boolean
    onSave: (proceed: boolean) => void
    onCancel: () => void
}

export const Step1Footer: FC<Step1FooterProps> = ({ isSaving, isStep1Valid, onSave, onCancel }) => {
    return (
        <Group mt="xs" justify="space-between" style={{ width: '100%' }}>
            <Button type="button" variant="subtle" size="md" onClick={onCancel} disabled={isSaving}>
                Cancel
            </Button>
            <Button
                type="button"
                size="md"
                variant="primary"
                disabled={!isStep1Valid || isSaving}
                loading={isSaving}
                onClick={() => onSave(true)}
            >
                Proceed to Step 2
            </Button>
        </Group>
    )
}
