'use client'

import { FC } from 'react'
import { Button, Group } from '@mantine/core'

interface Step1FooterProps {
    isSaving: boolean
    isValid: boolean
    onSave: (proceed: boolean) => void
    proceedLabel: string
    saveDraft?: { isDirty: boolean }
    onCancel?: () => void
}

const Step1Footer: FC<Step1FooterProps> = ({ isSaving, isValid, onSave, proceedLabel, saveDraft, onCancel }) => {
    const showCancel = !!onCancel

    return (
        <Group mt="xs" justify={showCancel ? 'space-between' : 'flex-end'} style={{ width: '100%' }}>
            {showCancel && (
                <Button type="button" variant="subtle" size="md" onClick={onCancel} disabled={isSaving}>
                    Cancel
                </Button>
            )}
            <Group>
                {saveDraft && (
                    <Button
                        type="button"
                        variant="outline"
                        size="md"
                        disabled={!saveDraft.isDirty || isSaving}
                        loading={isSaving}
                        onClick={() => onSave(false)}
                    >
                        Save as draft
                    </Button>
                )}
                <Button
                    type="button"
                    size="md"
                    variant="primary"
                    disabled={!isValid || isSaving}
                    loading={isSaving}
                    onClick={() => onSave(true)}
                >
                    {proceedLabel}
                </Button>
            </Group>
        </Group>
    )
}

interface ProposalFooterActionsProps {
    isSaving: boolean
    isValid: boolean
    onSave: (proceed: boolean) => void
    saveDraft?: { isDirty: boolean }
    onCancel?: () => void
    proceedLabel: string
}

export const ProposalFooterActions: FC<ProposalFooterActionsProps> = (props) => {
    return <Step1Footer {...props} />
}
