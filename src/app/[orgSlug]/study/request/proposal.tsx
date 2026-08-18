'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Stack } from '@mantine/core'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { languageLabels } from '@/lib/languages'
import { Routes } from '@/lib/routes'
import { useStudyRequest } from '@/contexts/study-request'
import { SetupForm } from './setup-form'
import { useSetupForm } from './use-setup-form'
import { ProposalFooterActions } from './proposal-footer-actions'
import { StudyRequestPageHeader } from './page-header'
import type { DraftStudyData } from '@/contexts/study-request'

interface StudyProposalProps {
    studyId?: string
    draftData?: DraftStudyData | null
}

const MODAL_BODY =
    'Make sure your Data Partner and programming language are correct. They cannot be changed after this step. You can still edit your study title.'

/**
 * Which fields are read-only, derived from persisted server data only.
 *
 * Never from local or session state: that is what makes "the disabled title survives navigation,
 * reload and a new session" true by construction rather than by a guard someone can forget.
 *
 * Both guards are load-bearing:
 * - `!!status`: a brand-new study at /study/request has no persisted row, so `status` is
 *   undefined and a bare `status !== 'DRAFT'` reads as locked on the one screen whose entire
 *   purpose is entering the title.
 * - `!!persistedValue`: having a studyId does not mean a Data Partner or a language was ever
 *   chosen. Locking on the id alone would leave a draft that never got one permanently
 *   uncompletable, with no field to fix and a Continue click that can never pass validation.
 */
function deriveLocks(studyId: string | undefined, draftData: DraftStudyData | null | undefined) {
    return {
        isTitleLocked: !!draftData?.status && draftData.status !== 'DRAFT',
        isOrgLocked: !!studyId && !!draftData?.orgSlug,
        isLanguageLocked: !!studyId && !!draftData?.language,
    }
}

export const StudyProposal: React.FC<StudyProposalProps> = ({ studyId, draftData }) => {
    const router = useRouter()
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()
    const { form, saveDraft, isSaving, reset, initFromDraft } = useStudyRequest()
    const [isProceeding, setIsProceeding] = useState(false)

    const locks = deriveLocks(studyId, draftData)
    const { titleValue, titleError, onTitleChange, onTitleBlur, attemptContinue, isConfirmOpen, closeConfirm } =
        useSetupForm({ form, ...locks })

    useEffect(() => {
        // Only initialize if we have draft data to load
        // For new studies, the context is already fresh (no need to reset)
        if (draftData) {
            initFromDraft(draftData, submittingOrgSlug)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when draft ID changes, not on every object reference change
    }, [draftData?.id, submittingOrgSlug])

    // Step 1 has no autosave, so proceeding persists the study row (create or update)
    // before advancing to the collaborative Step 2 editor.
    const handleConfirmContinue = () => {
        closeConfirm()
        setIsProceeding(true)
        saveDraft({
            onSuccess: ({ studyId: newStudyId }) => {
                form.resetDirty()
                router.push(Routes.studyProposal({ orgSlug: submittingOrgSlug, studyId: newStudyId }))
            },
            onError: () => setIsProceeding(false),
        })
    }

    // Resets client state and returns to the dashboard. It does not delete a persisted row, which
    // is why the "Discard study" wording is confined to the case where nothing has been saved yet.
    const handleCancel = () => {
        reset()
        router.push(Routes.dashboard)
    }

    const lockedLanguageLabel = draftData?.language ? languageLabels[draftData.language] : undefined
    const isExistingDraft = !!studyId

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={submittingOrgSlug} studyId={studyId} studyTitle={draftData?.title} />
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
                onProceed={attemptContinue}
                onCancel={handleCancel}
                cancelLabel={isExistingDraft ? 'Cancel' : 'Discard study'}
                cancelVariant={isExistingDraft ? 'subtle' : 'outline'}
                proceedLabel="Save & continue"
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
