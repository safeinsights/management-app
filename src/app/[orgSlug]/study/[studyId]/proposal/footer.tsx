'use client'

import { FC, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { AppModal } from '@/components/modal'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useProposal } from '@/contexts/proposal'
import { Routes } from '@/lib/routes'
import { hasLexicalContent } from '@/lib/word-count'
import { ReviewerPreview } from './reviewer-preview'

interface ProposalFooterProps {
    researcherName: string
}

export const ProposalFooter: FC<ProposalFooterProps> = ({ researcherName }) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, form, saveDraft, submitProposal, isSaving, isSubmitting } = useProposal()
    const [isReviewerModalOpen, setIsReviewerModalOpen] = useState(false)

    const isBusy = isSaving || isSubmitting
    // lexical fields store JSON even when empty, so we extract the
    // text to determine if there's real content. title is excluded
    // because it's always pre-populated as "Untitled draft".
    const { researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName

    const handlePrevious = async () => {
        const saved = await saveDraft()
        if (saved) router.push(Routes.studyEdit({ orgSlug, studyId }))
    }

    return (
        <>
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
                    <Button
                        variant="outline"
                        size="md"
                        disabled={!hasContent || isBusy}
                        onClick={() => setIsReviewerModalOpen(true)}
                    >
                        View as reviewer
                    </Button>
                    <Button
                        variant="outline"
                        size="md"
                        disabled={!form.isDirty() || isBusy}
                        loading={isSaving}
                        onClick={saveDraft}
                    >
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

            <AppModal
                size="xl"
                isOpen={isReviewerModalOpen}
                onClose={() => setIsReviewerModalOpen(false)}
                title="View as reviewer"
            >
                <ReviewerPreview researcherName={researcherName} />
            </AppModal>
        </>
    )
}
