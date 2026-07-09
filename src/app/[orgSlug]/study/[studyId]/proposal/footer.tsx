'use client'

import { FC } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modals/app-modal'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useProposal } from '@/contexts/proposal'
import { Routes } from '@/lib/routes'
import { hasLexicalContent } from '@/lib/lexical'
import { hasUserProvidedTitle, isProposalDraftDirty } from './schema'
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
    const [reviewerOpen, { open: openReviewer, close: closeReviewer }] = useDisclosure(false)
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    const isBusy = isSaving || isSubmitting
    // lexical fields store JSON even when empty, so we extract the
    // text to determine if there's real content. title is excluded
    // because it's always pre-populated as "Untitled draft".
    const { title, researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName
    const canSubmit = form.isValid() && hasUserProvidedTitle(title)

    const handleConfirmSubmit = () => {
        closeConfirm()
        submitProposal()
    }

    const handlePrevious = async () => {
        const saved = await saveDraft()
        // /edit is revisitable — it renders Step 1 directly and no longer resume-redirects, so the
        // back-step needs no signal.
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
                    <Button variant="outline" size="md" disabled={!hasContent || isBusy} onClick={openReviewer}>
                        View as reviewer
                    </Button>
                    <Button
                        variant="outline"
                        size="md"
                        disabled={!isProposalDraftDirty(form) || isBusy}
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
                        onClick={openConfirm}
                    >
                        Submit initial request
                    </Button>
                </Group>
            </Group>

            <SubmitConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmSubmit}
                isSubmitting={isSubmitting}
                title="Confirm initial request submission?"
                body="Please confirm you are ready to submit your initial request. Further edits are not permitted once submitted."
                confirmLabel="Yes, submit initial request"
            />

            <AppModal size="xl" isOpen={reviewerOpen} onClose={closeReviewer} title="View as reviewer">
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
