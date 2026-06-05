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
    const { studyId, form, noteForm, saveDraft, resubmit, isSaving, isSubmitting, isSavingNote } = useEditResubmit()

    const [reviewerOpen, { open: openReviewer, close: closeReviewer }] = useDisclosure(false)
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    const isBusy = isSaving || isSavingNote || isSubmitting

    const { title, researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName

    const isFormValid = form.isValid() && noteForm.isValid() && hasUserProvidedTitle(title)

    const handleBack = async () => {
        if (form.isDirty() || noteForm.isDirty()) {
            const saved = await saveDraft()
            if (!saved) return
        }
        // The only legitimate entry to this page today is the "Edit & resubmit"
        // button on /submitted. If we ever add deep links or a dashboard CTA,
        // disambiguate the Back target with a ?from= query param (see
        // review/page.tsx for prior art).
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
                    loading={isSaving}
                    onClick={handleBack}
                >
                    Back
                </Button>
                <Group>
                    <Button variant="outline" size="md" disabled={!hasContent || isBusy} onClick={openReviewer}>
                        View as reviewer
                    </Button>
                    <Button
                        variant="outline"
                        size="md"
                        disabled={(!form.isDirty() && !noteForm.isDirty()) || isBusy}
                        loading={isSaving || isSavingNote}
                        onClick={saveDraft}
                    >
                        Save as draft
                    </Button>
                    <Button
                        size="md"
                        variant="primary"
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
                confirmLabel="Yes, submit initial request"
            />
        </>
    )
}
