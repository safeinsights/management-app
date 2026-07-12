'use client'

import { FC } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modals/app-modal'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useProposal } from '@/contexts/proposal'
import { useSaveProposalDraft } from '@/contexts/proposal/hooks/use-save-proposal-draft'
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
    const { studyId, form, submitProposal, isSubmitting } = useProposal()
    const { saveDraft, isSaving } = useSaveProposalDraft(studyId, form)
    const [reviewerOpen, { open: openReviewer, close: closeReviewer }] = useDisclosure(false)
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    const isBusy = isSubmitting || isSaving
    // lexical fields store JSON even when empty, so extract the text to detect real
    // content. title is excluded — it's gated separately via canSubmit below.
    const { title, researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName
    const canSubmit = form.isValid() && hasUserProvidedTitle(title)

    const handleConfirmSubmit = () => {
        closeConfirm()
        submitProposal()
    }

    const handlePrevious = async () => {
        // Flush Step 2 fields to the study row so draftHasStep2Progress resolves
        // correctly on the dashboard. In single-user mode (CI / PR envs) Yjs
        // autosave is inactive, so this is the only write path.
        const saved = await saveDraft()
        if (!saved) return
        router.push(Routes.studyEdit({ orgSlug, studyId }))
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
