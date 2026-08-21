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
import { ReviewerPreview } from './reviewer-preview'
import { useProposalSubmitAttempt } from './use-proposal-submit-attempt'

const CONFIRM_BODY = (orgName: string) =>
    `Your proposal will be sent to ${orgName} for review. You will not be able to make changes once submitted.`

interface ProposalFooterProps {
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
    /** The persisted `study.title`, which Step 1 owns for drafts (OTTER-690). */
    studyTitle?: string | null
    /** Display name of the Data Partner the proposal goes to. Interpolated into the modal. */
    orgName: string
}

export const ProposalFooter: FC<ProposalFooterProps> = ({
    researcherName,
    researcherId,
    enclaveOrgSlug,
    studyTitle,
    orgName,
}) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, form, submitProposal, isSubmitting } = useProposal()
    // titleMode 'omit': Step 1 owns study.title on a DRAFT, and this form's copy is only a seed
    // for the reviewer preview. Sending it back would let a stale value overwrite the Step 1 one.
    const { saveDraft, isSaving } = useSaveProposalDraft(studyId, form, { titleMode: 'omit' })
    const [reviewerOpen, { open: openReviewer, close: closeReviewer }] = useDisclosure(false)
    const { attemptSubmit, isConfirmOpen, closeConfirm } = useProposalSubmitAttempt(form)

    const isBusy = isSubmitting || isSaving
    // lexical fields store JSON even when empty, so extract the text to detect real content.
    const { researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName
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

    const handleOpenReviewer = async () => {
        // Flush the form first: the preview's PI popover fetches the profile server-side, and
        // the server only serves ids the persisted study row names — an unsaved piUserId would
        // be denied and render as "Profile not available".
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
                    loading={isSaving}
                    onClick={handlePrevious}
                >
                    Previous step
                </Button>
                <Group align="flex-start">
                    <Button variant="outline" size="md" disabled={!hasContent || isBusy} onClick={handleOpenReviewer}>
                        View as reviewer
                    </Button>
                    {/* Never disabled on validity. Clicking it is what surfaces the errors, and a
                        disabled button explains nothing (OTTER-691). */}
                    <Button size="md" variant="filled" disabled={isBusy} loading={isSubmitting} onClick={attemptSubmit}>
                        Submit proposal
                    </Button>
                </Group>
            </Group>

            <SubmitConfirmationModal
                isOpen={isConfirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmSubmit}
                isSubmitting={isSubmitting}
                title="Submit your proposal?"
                body={CONFIRM_BODY(orgName)}
                confirmLabel="Submit proposal"
                confirmLoadingLabel="Submitting"
            />

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
        </>
    )
}
