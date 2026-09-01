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

// Derived from persisted server data only, so the lock survives navigation and reload.
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
        if (draftData) {
            initFromDraft(draftData, submittingOrgSlug)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when draft ID changes, not on every object reference change
    }, [draftData?.id, submittingOrgSlug])

    // Step 1 has no autosave, so proceeding persists the study row before Step 2.
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

    // Does not delete a persisted row, which is why "Discard study" wording is confined to the
    // case where nothing has been saved yet.
    const handleCancel = () => {
        reset()
        router.push(Routes.dashboard)
    }

    const lockedLanguageLabel = draftData?.language ? languageLabels[draftData.language] : undefined
    const isExistingDraft = !!studyId

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
