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
    studyId?: string
    draftData?: DraftStudyData | null
    /** Set when the researcher entered from an org dashboard, so the step forward can hand it back. */
    returnTo?: 'org'
}

const MODAL_BODY =
    'Make sure your Data Partner and programming language are correct. They cannot be changed after this step. You can still edit your study title.'

// The three states Step 1 is reached in (OTTER-764): `create` has no study row and every field
// open, `revisit` is a persisted draft with only the title editable, and `submitted` is a
// read-only record.
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

// Derived from persisted server data only, so the state and locks survive navigation and reload.
function deriveSetupState(studyId: string | undefined, draftData: DraftStudyData | null | undefined) {
    // `!!status` as well as the comparison: a study with no persisted row has no status, and a bare
    // `status !== 'DRAFT'` would read as submitted on the screen whose purpose is entering the title.
    const isSubmitted = !!draftData?.status && draftData.status !== 'DRAFT'

    let navMode: SetupNavMode = 'create'
    if (studyId) navMode = isSubmitted ? 'submitted' : 'revisit'

    const locks: SetupFormLocks = {
        isTitleLocked: isSubmitted,
        // The `!!persistedValue` guards stay on a draft: a studyId does not mean a Data Partner or a
        // language was ever chosen, and locking on the id alone would leave it uncompletable.
        isOrgLocked: isSubmitted || (!!studyId && !!draftData?.orgSlug),
        isLanguageLocked: isSubmitted || (!!studyId && !!draftData?.language),
    }

    return { navMode, locks }
}

export const StudyProposal: React.FC<StudyProposalProps> = ({ studyId, draftData, returnTo }) => {
    const router = useRouter()
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()
    const { form, saveDraft, isSaving, initFromDraft } = useStudyRequest()
    const [isProceeding, setIsProceeding] = useState(false)

    const { navMode, locks } = deriveSetupState(studyId, draftData)

    // Step 1 has no autosave, so proceeding persists the study row before Step 2.
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

    // A submitted proposal has nothing to validate or save, so the CTA only steps forward
    // (OTTER-764). `isProceeding` still guards it: the target re-reads from the server, and without
    // it the button looks dead for the whole navigation. Nothing resets it, the page is leaving.
    const goToSubmitted = useCallback(() => {
        if (!studyId) return
        setIsProceeding(true)
        router.push(Routes.studySubmitted({ orgSlug: submittingOrgSlug, studyId, returnTo }))
    }, [router, submittingOrgSlug, studyId, returnTo])

    const { titleValue, titleError, onTitleChange, onTitleBlur, attemptContinue, isConfirmOpen, closeConfirm } =
        useSetupForm({
            form,
            ...locks,
            // Derived from the same locks rather than from navMode, so the modal cannot go quiet
            // while a choice it warns about is still editable.
            requiresConfirmation: !locks.isOrgLocked || !locks.isLanguageLocked,
            onProceed: saveAndAdvance,
        })

    useEffect(() => {
        if (draftData) {
            initFromDraft(draftData, submittingOrgSlug)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when draft ID changes, not on every object reference change
    }, [draftData?.id, submittingOrgSlug])

    const handleConfirmContinue = () => {
        closeConfirm()
        saveAndAdvance()
    }

    const lockedLanguageLabel = draftData?.language ? languageLabels[draftData.language] : undefined

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

            {/* No left action in any state: OTTER-690 review took "Discard study" out of scope.
                Deleting a draft lives behind the dashboard. */}
            <ProposalFooterActions
                isSaving={isSaving || isProceeding}
                onProceed={onProceed}
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
