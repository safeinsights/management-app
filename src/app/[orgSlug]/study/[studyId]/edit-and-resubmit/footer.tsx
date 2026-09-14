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
import { SUBMIT_BUTTON_ID } from '@/app/[orgSlug]/study/[studyId]/proposal/field-ids'
import { confirmSubmitBody } from '@/app/[orgSlug]/study/[studyId]/proposal/copy'
import { useResubmitAttempt } from './use-resubmit-attempt'

interface EditResubmitFooterProps {
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
    orgName: string
    /** The persisted `study.title`, which this page reads for the reviewer preview but no longer edits. */
    studyTitle?: string | null
}

export const EditResubmitFooter: FC<EditResubmitFooterProps> = ({
    researcherName,
    researcherId,
    enclaveOrgSlug,
    orgName,
    studyTitle,
}) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, form, noteForm, flushNote, resubmit, isSubmitting, isSavingNote } = useEditResubmit()
    // titleMode 'omit': the title field left this page (OTTER-762), so the form's copy is only a
    // seed and sending it back would let a stale value overwrite the stored one.
    const { saveDraft, isSaving } = useSaveProposalDraft(studyId, form, { titleMode: 'omit' })

    const [reviewerOpen, { open: openReviewer, close: closeReviewer }] = useDisclosure(false)
    const { attemptResubmit, isConfirmOpen, closeConfirm } = useResubmitAttempt({ form, noteForm, isSubmitting })

    const isBusy = isSavingNote || isSaving || isSubmitting

    const { researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName

    const handleBack = async () => {
        // Yjs autosave is inactive in single-user mode, so flush explicitly.
        const [fieldsSaved, noteSaved] = await Promise.all([saveDraft(), flushNote()])
        if (!fieldsSaved || !noteSaved) return
        router.push(Routes.studyEdit({ orgSlug, studyId }))
    }

    const handleOpenReviewer = async () => {
        // The server only serves PI profiles the persisted study row names, so an unsaved
        // piUserId would render as "Profile not available".
        const saved = await saveDraft()
        if (!saved) return
        openReviewer()
    }

    return (
        <>
            <Group mt="xs" justify="space-between" align="flex-start" w="100%">
                <Button
                    type="button"
                    variant="subtle"
                    size="md"
                    leftSection={<CaretLeftIcon />}
                    disabled={isBusy}
                    loading={isSavingNote || isSaving}
                    onClick={handleBack}
                >
                    Previous step
                </Button>
                <Group align="flex-start">
                    <Button variant="outline" size="md" disabled={!hasContent || isBusy} onClick={handleOpenReviewer}>
                        View as reviewer
                    </Button>
                    {/* Never disabled on validity: clicking it is what surfaces the errors
                        (OTTER-762). */}
                    <Button
                        id={SUBMIT_BUTTON_ID}
                        size="md"
                        variant="filled"
                        disabled={isBusy}
                        loading={isSubmitting}
                        onClick={attemptResubmit}
                    >
                        Resubmit proposal
                    </Button>
                </Group>
            </Group>

            <AppModal size="xl" isOpen={reviewerOpen} onClose={closeReviewer} title="View as reviewer">
                <ReviewerPreview
                    studyId={studyId}
                    studyTitle={studyTitle}
                    values={form.values}
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                />
            </AppModal>

            <SubmitConfirmationModal
                isOpen={isConfirmOpen}
                onClose={closeConfirm}
                onConfirm={resubmit}
                isSubmitting={isSubmitting}
                title="Resubmit your proposal?"
                body={confirmSubmitBody(orgName)}
                confirmLabel="Resubmit proposal"
                confirmLoadingLabel="Resubmitting"
            />
        </>
    )
}
