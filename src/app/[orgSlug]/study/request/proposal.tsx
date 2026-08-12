'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Stack } from '@mantine/core'
import { Routes } from '@/lib/routes'
import { useStudyRequest } from '@/contexts/study-request'
import { StudyProposalForm } from './proposal-form'
import { ProposalFooterActions } from './proposal-footer-actions'
import { StudyRequestPageHeader } from './page-header'
import type { DraftStudyData } from '@/contexts/study-request'

interface StudyProposalProps {
    studyId?: string
    draftData?: DraftStudyData | null
}

export const StudyProposal: React.FC<StudyProposalProps> = ({ studyId, draftData }) => {
    const router = useRouter()
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()
    const { form, isStep1Valid, saveDraft, isSaving, reset, initFromDraft } = useStudyRequest()
    const [isProceeding, setIsProceeding] = useState(false)

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
    const handleProceed = () => {
        setIsProceeding(true)
        saveDraft({
            onSuccess: ({ studyId: newStudyId }) => {
                form.resetDirty()
                router.push(Routes.studyProposal({ orgSlug: submittingOrgSlug, studyId: newStudyId }))
            },
            onError: () => setIsProceeding(false),
        })
    }

    const handleCancel = () => {
        reset()
        router.push(Routes.dashboard)
    }

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={submittingOrgSlug} studyId={studyId} studyTitle={draftData?.title} />
            <StudyProposalForm studyProposalForm={form} />

            <ProposalFooterActions
                isSaving={isSaving || isProceeding}
                isValid={isStep1Valid}
                onProceed={handleProceed}
                onCancel={handleCancel}
                proceedLabel="Proceed to Step 2"
            />
        </Stack>
    )
}
