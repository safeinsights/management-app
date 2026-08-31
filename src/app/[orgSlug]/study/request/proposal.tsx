'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Stack } from '@mantine/core'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { languageLabels } from '@/lib/languages'
import { Routes } from '@/lib/routes'
import { useStudyRequest } from '@/contexts/study-request'
import { SetupForm } from './setup-form'
import { useSetupForm, type SetupFormLocks } from './use-setup-form'
import { ProposalFooterActions } from './proposal-footer-actions'
import { StudyRequestPageHeader } from './page-header'
import type { DraftStudyData } from '@/contexts/study-request'

interface StudyProposalProps {
    /** Present once the draft has a persisted row. Drives the locks and the navigation state. */
    studyId?: string
    draftData?: DraftStudyData | null
}

const MODAL_BODY =
    'Make sure your Data Partner and programming language are correct. They cannot be changed after this step. You can still edit your study title.'

/**
 * The three states Step 1 is reached in (OTTER-764):
 * - `create`: no study row yet, every field open, the confirmation modal guards the choices.
 * - `revisit`: the researcher came back to a persisted draft. Only the title is still editable.
 * - `submitted`: the proposal has gone to the Data Partner. The page is a read-only record.
 */
type SetupNavMode = 'create' | 'revisit' | 'submitted'

/**
 * The first visit and a revisit differ by the ampersand because the cards specify them that way:
 * OTTER-690 wrote "Save & continue" for the new-study page and OTTER-764 wrote "Save and continue"
 * for the back-navigation state. Not a typo to tidy up.
 */
const CTA_LABELS: Record<SetupNavMode, string> = {
    create: 'Save & continue',
    revisit: 'Save and continue',
    submitted: 'Next step',
}

/**
 * Which state the page is in and which fields are read-only, derived from persisted server data only.
 *
 * Never from local or session state: that is what makes "the disabled title survives navigation,
 * reload and a new session" true by construction rather than by a guard someone can forget.
 */
function deriveSetupState(studyId: string | undefined, draftData: DraftStudyData | null | undefined) {
    // `!!status` as well as the comparison: a brand-new study at /study/request has no persisted row,
    // so `status` is undefined and a bare `status !== 'DRAFT'` reads as submitted on the one screen
    // whose entire purpose is entering the title.
    const isSubmitted = !!draftData?.status && draftData.status !== 'DRAFT'

    let navMode: SetupNavMode = 'create'
    if (studyId) navMode = isSubmitted ? 'submitted' : 'revisit'

    const locks: SetupFormLocks = {
        isTitleLocked: isSubmitted,
        // A submitted study locks every field whether or not each value is present, because the whole
        // page is a record at that point. On a draft the `!!persistedValue` guards stay: having a
        // studyId does not mean a Data Partner or a language was ever chosen, and locking on the id
        // alone would leave such a draft permanently uncompletable, with no field to fix and a
        // Continue click that can never pass validation.
        isOrgLocked: isSubmitted || (!!studyId && !!draftData?.orgSlug),
        isLanguageLocked: isSubmitted || (!!studyId && !!draftData?.language),
    }

    return { navMode, locks }
}

export const StudyProposal: React.FC<StudyProposalProps> = ({ studyId, draftData }) => {
    const router = useRouter()
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()
    const { form, saveDraft, isSaving, reset, initFromDraft } = useStudyRequest()
    const [isProceeding, setIsProceeding] = useState(false)

    const { navMode, locks } = deriveSetupState(studyId, draftData)

    // Step 1 has no autosave, so proceeding persists the study row (create or update)
    // before advancing to the collaborative Step 2 editor.
    const saveAndAdvance = useCallback(() => {
        setIsProceeding(true)
        saveDraft({
            onSuccess: ({ studyId: newStudyId }) => {
                form.resetDirty()
                router.push(Routes.studyProposal({ orgSlug: submittingOrgSlug, studyId: newStudyId }))
            },
            onError: () => setIsProceeding(false),
        })
    }, [saveDraft, form, router, submittingOrgSlug])

    // Once the proposal is submitted there is nothing to validate and nothing to save, so the CTA is
    // a plain step forward to the submitted record (OTTER-764).
    const goToSubmitted = useCallback(() => {
        if (!studyId) return
        router.push(Routes.studySubmitted({ orgSlug: submittingOrgSlug, studyId }))
    }, [router, submittingOrgSlug, studyId])

    const { titleValue, titleError, onTitleChange, onTitleBlur, attemptContinue, isConfirmOpen, closeConfirm } =
        useSetupForm({
            form,
            ...locks,
            requiresConfirmation: navMode === 'create',
            onProceed: saveAndAdvance,
        })

    useEffect(() => {
        // Only initialize if we have draft data to load
        // For new studies, the context is already fresh (no need to reset)
        if (draftData) {
            initFromDraft(draftData, submittingOrgSlug)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when draft ID changes, not on every object reference change
    }, [draftData?.id, submittingOrgSlug])

    const handleConfirmContinue = () => {
        closeConfirm()
        saveAndAdvance()
    }

    // Resets client state and returns to the dashboard. It does not delete a persisted row, which
    // is why it is offered only before anything has been saved.
    const handleCancel = () => {
        reset()
        router.push(Routes.dashboard)
    }

    const lockedLanguageLabel = draftData?.language ? languageLabels[draftData.language] : undefined

    // "Discard study" belongs to the state where no row exists yet, when leaving really does make the
    // study never have existed. Once it is persisted, deleting it belongs to the dashboard.
    const onCancel = navMode === 'create' ? handleCancel : undefined
    const onProceed = navMode === 'submitted' ? goToSubmitted : attemptContinue

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader />
            <SetupForm
                form={form}
                titleValue={titleValue}
                titleError={titleError}
                onTitleChange={onTitleChange}
                onTitleBlur={onTitleBlur}
                lockedOrgName={draftData?.orgName}
                lockedLanguageLabel={lockedLanguageLabel}
                {...locks}
            />

            <ProposalFooterActions
                isSaving={isSaving || isProceeding}
                onProceed={onProceed}
                onCancel={onCancel}
                cancelLabel="Discard study"
                cancelVariant="outline"
                proceedLabel={CTA_LABELS[navMode]}
            />

            <SubmitConfirmationModal
                isOpen={isConfirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmContinue}
                isSubmitting={isSaving || isProceeding}
                title="Continue to the next step?"
                body={MODAL_BODY}
                confirmLabel="Continue"
            />
        </Stack>
    )
}
