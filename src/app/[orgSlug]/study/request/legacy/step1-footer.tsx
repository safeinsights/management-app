'use client'

import { FC } from 'react'
import { Button, Group } from '@mantine/core'

interface Step1FooterProps {
    isDirty: boolean
    isSaving: boolean
    isFormValid: boolean
    onSave: (proceed: boolean) => void
}

export const Step1Footer: FC<Step1FooterProps> = ({ isDirty, isSaving, isFormValid, onSave }) => {
    return (
        <Group mt="xs" style={{ width: '100%' }}>
            <Group style={{ marginLeft: 'auto' }}>
                <Button
                    type="button"
                    variant="outline"
                    size="md"
                    disabled={!isDirty || isSaving}
                    loading={isSaving}
                    onClick={() => onSave(false)}
                >
                    Save as draft
                </Button>
                <Button
                    type="button"
                    size="md"
                    variant="primary"
                    disabled={!isFormValid || isSaving}
                    loading={isSaving}
                    onClick={() => onSave(true)}
                >
                    Save and proceed to code upload
                </Button>
            </Group>
        </Group>
    )
}
