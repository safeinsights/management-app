'use client'

import { FC, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modal'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useProposal } from '@/contexts/proposal'
import { Routes } from '@/lib/routes'
import { hasLexicalContent } from '@/lib/lexical'
import { hasUserProvidedTitle } from './schema'
import { ReviewerPreview } from './reviewer-preview'
interface ProposalFooterProps {
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
}

export const ProposalFooter: FC<ProposalFooterProps> = ({ researcherName, researcherId, enclaveOrgSlug }) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, form, saveDraft, submitProposal, isSaving, isSubmitting } = useProposal()
    const [isReviewerModalOpen, setIsReviewerModalOpen] = useState(false)
    const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false)

    const isBusy = isSaving || isSubmitting
    // lexical fields store JSON even when empty, so we extract the
    // text to determine if there's real content. title is excluded
    // because it's always pre-populated as "Untitled draft".
    const { title, researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName
    const canSubmit = form.isValid() && hasUserProvidedTitle(title)

    const handlePrevious = async () => {
        const saved = await saveDraft()
        if (saved) router.push(Routes.studyEdit({ orgSlug, studyId }))
    }

    return (
        <>
            <Group mt="xs" justify="space-between" w="100%">
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
                        disabled={!canSubmit || isBusy}
                        loading={isSubmitting}
                        onClick={() => setIsSubmitConfirmOpen(true)}
                    >
                        Submit initial request
                    </Button>
                </Group>
            </Group>

            <SubmitConfirmationModal
                isOpen={isSubmitConfirmOpen}
                onClose={() => setIsSubmitConfirmOpen(false)}
                onConfirm={submitProposal}
                isSubmitting={isSubmitting}
            />

            <AppModal
                size="xl"
                isOpen={isReviewerModalOpen}
                onClose={() => setIsReviewerModalOpen(false)}
                title="View as reviewer"
            >
                <ReviewerPreview
                    studyId={studyId}
                    values={form.values}
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                />
            </AppModal>
        </>
    )
}

const SubmitConfirmationModal: FC<{
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isSubmitting: boolean
}> = ({ isOpen, onClose, onConfirm, isSubmitting }) => (
    <AppModal isOpen={isOpen} onClose={onClose} title="Confirm initial request submission?">
        <Stack gap="xl">
            <Text size="md">
                Please confirm you are ready to submit your initial request. Further edits are not permitted once
                submitted.
            </Text>
            <Group justify="flex-end">
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button variant="primary" onClick={onConfirm} loading={isSubmitting}>
                    Yes, submit initial request
                </Button>
            </Group>
        </Stack>
    </AppModal>
)
