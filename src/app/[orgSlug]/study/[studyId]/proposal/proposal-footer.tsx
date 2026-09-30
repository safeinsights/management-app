'use client'

import { FC } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { AppModal } from '@/components/modals/app-modal'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { useSaveProposalDraft } from '@/contexts/proposal/hooks/use-save-proposal-draft'
import { Routes } from '@/lib/routes'
import { hasLexicalContent } from '@/lib/lexical'
import { ReviewerPreview } from './reviewer-preview'
import { useProposalSubmitAttempt } from './use-proposal-submit-attempt'
import { SUBMIT_BUTTON_ID } from './field-ids'
import { type ConfirmModalCopy } from './copy'
import { type ProposalFormValues } from './schema'

interface ProposalFooterProps {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
    /** The persisted `study.title`, read for the reviewer preview; Step 1 owns it (OTTER-690). */
    studyTitle?: string | null
    submitLabel: string
    modalCopy: ConfirmModalCopy
    onSubmit: () => void
    isSubmitting: boolean
    /** Validates every form on the page and returns the DOM ids of the fields that failed. */
    validate: () => Set<string>
    orderedFieldIds?: string[]
    /** Drafts beyond the proposal fields to flush before leaving; false blocks the navigation. */
    flushBeforeLeave?: () => Promise<boolean>
    isFlushing?: boolean
}

const nothingToFlush = () => Promise.resolve(true)

// Step 2 and Edit proposal share this footer (OTTER-762): the pages differ only in what they
// submit and what else they must save, so that arrives as props and nothing here reads a context.
export const ProposalFooter: FC<ProposalFooterProps> = ({
    studyId,
    form,
    researcherName,
    researcherId,
    enclaveOrgSlug,
    studyTitle,
    submitLabel,
    modalCopy,
    onSubmit,
    isSubmitting,
    validate,
    orderedFieldIds,
    flushBeforeLeave = nothingToFlush,
    isFlushing = false,
}) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    // titleMode 'omit': the form's title is only a seed for the preview, so sending it back would
    // let a stale value overwrite the one Step 1 persisted.
    const { saveDraft, isSaving } = useSaveProposalDraft(studyId, form, { titleMode: 'omit' })
    const [reviewerOpen, { open: openReviewer, close: closeReviewer }] = useDisclosure(false)
    const { attemptSubmit, isConfirmOpen, closeConfirm } = useProposalSubmitAttempt({
        isSubmitting,
        validate,
        orderedFieldIds,
    })

    const isBusy = isSubmitting || isSaving || isFlushing
    // Lexical fields store JSON even when empty, so extract the text to detect real content.
    const { researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName

    const handlePrevious = async () => {
        // Yjs autosave is inactive in single-user mode, so this is the only write path.
        const saved = await Promise.all([saveDraft(), flushBeforeLeave()])
        if (!saved.every(Boolean)) return
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
                    loading={isSaving || isFlushing}
                    onClick={handlePrevious}
                >
                    Previous step
                </Button>
                <Group align="flex-start">
                    <Button variant="outline" size="md" disabled={!hasContent || isBusy} onClick={handleOpenReviewer}>
                        View as reviewer
                    </Button>
                    {/* Never disabled on validity: clicking it is what surfaces the errors
                        (OTTER-691). */}
                    <Button
                        id={SUBMIT_BUTTON_ID}
                        size="md"
                        variant="filled"
                        disabled={isBusy}
                        loading={isSubmitting}
                        onClick={attemptSubmit}
                    >
                        {submitLabel}
                    </Button>
                </Group>
            </Group>

            <SubmitConfirmationModal
                isOpen={isConfirmOpen}
                onClose={closeConfirm}
                onConfirm={onSubmit}
                isSubmitting={isSubmitting}
                {...modalCopy}
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
