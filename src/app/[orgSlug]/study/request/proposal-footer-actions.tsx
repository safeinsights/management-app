'use client'

import { FC } from 'react'
import { Button, Group } from '@mantine/core'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'

interface ProposalFooterActionsProps {
    isDirty: boolean
    isSaving: boolean
    isFormValid: boolean
    isStep1Valid: boolean
    onSave: (proceed: boolean) => void
    onCancel: () => void
}

const LegacyFooter: FC<ProposalFooterActionsProps> = ({ isDirty, isSaving, isFormValid, onSave }) => {
    return (
        <Group mt="xxl" style={{ width: '100%' }}>
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

const OpenStaxFooter: FC<ProposalFooterActionsProps> = ({ isSaving, isStep1Valid, onSave, onCancel }) => {
    return (
        <Group mt="xxl" justify="space-between" style={{ width: '100%' }}>
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

export const ProposalFooterActions: FC<ProposalFooterActionsProps> = (props) => {
    return (
        <OpenStaxFeatureFlag
            defaultContent={<LegacyFooter {...props} />}
            optInContent={<OpenStaxFooter {...props} />}
        />
    )
}
