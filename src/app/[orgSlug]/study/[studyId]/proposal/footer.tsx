'use client'

import { FC } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useProposal } from '@/contexts/proposal'
import { Routes } from '@/lib/routes'

export const ProposalFooter: FC = () => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, form, saveDraft, submitProposal, isSaving, isSubmitting } = useProposal()

    const isBusy = isSaving || isSubmitting

    const handlePrevious = async () => {
        await saveDraft()
        router.push(Routes.studyEdit({ orgSlug, studyId }))
    }

    return (
        <Group mt="xs" justify="space-between" style={{ width: '100%' }}>
            <Button
                type="button"
                variant="subtle"
                size="md"
                leftSection={<CaretLeftIcon />}
                disabled={isBusy}
                loading={isSaving}
                onClick={handlePrevious}
            >
                Previous
            </Button>
            <Group>
                <Button variant="outline" size="md" disabled={isBusy} loading={isSaving} onClick={saveDraft}>
                    Save as draft
                </Button>
                <Button
                    size="md"
                    variant="primary"
                    disabled={!form.isValid() || isBusy}
                    loading={isSubmitting}
                    onClick={submitProposal}
                >
                    Submit study proposal
                </Button>
            </Group>
        </Group>
    )
}
