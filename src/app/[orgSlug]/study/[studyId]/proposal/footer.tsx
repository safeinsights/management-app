'use client'

import { FC } from 'react'
import { Button, Group } from '@mantine/core'
import { useProposal } from './context'

export const ProposalFooter: FC = () => {
    const { form, saveDraft, submitProposal, isSaving, isSubmitting } = useProposal()

    const isBusy = isSaving || isSubmitting
    const isFormValid = form.isValid()

    return (
        <Group justify="flex-end">
            <Button variant="outline" size="md" disabled={isBusy} loading={isSaving} onClick={saveDraft}>
                Save as draft
            </Button>
            <Button
                size="md"
                variant="primary"
                disabled={!isFormValid || isBusy}
                loading={isSubmitting}
                onClick={submitProposal}
            >
                Submit study proposal
            </Button>
        </Group>
    )
}
