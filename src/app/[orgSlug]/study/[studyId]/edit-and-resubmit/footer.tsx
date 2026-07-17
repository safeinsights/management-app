'use client'

import { FC } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { AppModal } from '@/components/modals/app-modal'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { Routes } from '@/lib/routes'
import { hasLexicalContent } from '@/lib/lexical'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import { useSaveProposalDraft } from '@/contexts/proposal/hooks/use-save-proposal-draft'
import { ReviewerPreview } from '@/app/[orgSlug]/study/[studyId]/proposal/reviewer-preview'
import { hasUserProvidedTitle } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

interface EditResubmitFooterProps {
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
}

export const EditResubmitFooter: FC<EditResubmitFooterProps> = ({ researcherName, researcherId, enclaveOrgSlug }) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, form, noteForm, flushNote, resubmit, isSubmitting, isSavingNote } = useEditResubmit()
    // omitBlankTitle: nulling the title column on a CHANGE-REQUESTED row would
    // violate the study_title_required_when_not_draft check constraint.
    const { saveDraft, isSaving } = useSaveProposalDraft(studyId, form, { omitBlankTitle: true })

    const [reviewerOpen, { open: openReviewer, close: closeReviewer }] = useDisclosure(false)
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    const isBusy = isSavingNote || isSaving || isSubmitting

    const { title, researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName

    const isFormValid = form.isValid() && noteForm.isValid() && hasUserProvidedTitle(title)

    const handleBack = async () => {
        // In single-user mode (CI / PR envs) Yjs autosave is inactive, so flush
        // proposal fields to the study row explicitly. Also flush the debounced note.
        const [fieldsSaved, noteSaved] = await Promise.all([saveDraft(), flushNote()])
        if (!fieldsSaved || !noteSaved) return
        router.push(Routes.studySubmitted({ orgSlug, studyId }))
    }

    const handleConfirmResubmit = () => {
        closeConfirm()
        resubmit()
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
                    loading={isSavingNote || isSaving}
                    onClick={handleBack}
                >
                    Back
                </Button>
                <Group>
                    <Button variant="outline" size="md" disabled={!hasContent || isBusy} onClick={openReviewer}>
                        View as reviewer
                    </Button>
                    <Button
                        size="md"
                        variant="primary"
                        // OTTER-636: resubmit is NOT gated on the first-edit DRAFT flip. The flip is a
                        // best-effort display transition (it can no-op when a study has no base snapshot),
                        // and resubmitProposalAction accepts both CHANGE-REQUESTED and a revision DRAFT, so
                        // gating here would only risk stranding a researcher on a failed/slow flip.
                        disabled={!isFormValid || isBusy}
                        loading={isSubmitting}
                        onClick={openConfirm}
                    >
                        Resubmit initial request
                    </Button>
                </Group>
            </Group>

            <AppModal size="xl" isOpen={reviewerOpen} onClose={closeReviewer} title="View as reviewer">
                <ReviewerPreview
                    studyId={studyId}
                    values={form.values}
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                />
            </AppModal>

            <SubmitConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmResubmit}
                isSubmitting={isSubmitting}
                title="Confirm initial request resubmission?"
                body="Please confirm you are ready to resubmit your initial request. Further edits are not permitted once submitted."
                confirmLabel="Yes, resubmit initial request"
            />
        </>
    )
}
