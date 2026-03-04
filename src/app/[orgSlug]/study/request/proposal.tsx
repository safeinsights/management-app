'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { Stack } from '@mantine/core'
import ProxyProvider from '@/components/proxy-provider'
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

    const handleSave = (proceed: boolean) => {
        if (proceed) setIsProceeding(true)
        saveDraft({
            onSuccess: ({ studyId: newStudyId }) => {
                form.resetDirty()
                if (proceed) {
                    router.push(Routes.studyProposal({ orgSlug: submittingOrgSlug, studyId: newStudyId }))
                } else {
                    if (!studyId) {
                        router.replace(Routes.studyEdit({ orgSlug: submittingOrgSlug, studyId: newStudyId }), {
                            scroll: false,
                        })
                    }
                    notifications.show({
                        title: 'Draft Saved',
                        message: 'Your study proposal has been saved as a draft.',
                        color: 'green',
                    })
                }
            },
            onError: () => setIsProceeding(false),
        })
    }

    const handleCancel = () => {
        reset()
        router.back()
    }

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={submittingOrgSlug} />
            <ProxyProvider
                isDirty={form.isDirty()}
                onSaveDraft={() =>
                    new Promise<boolean>((resolve) => {
                        saveDraft({
                            onSuccess: () => {
                                form.resetDirty()
                                resolve(true)
                            },
                            onError: () => resolve(false),
                        })
                    })
                }
                isSavingDraft={isSaving}
                onNavigateAway={() => reset()}
            >
                <StudyProposalForm studyProposalForm={form} />

                <ProposalFooterActions
                    isSaving={isSaving || isProceeding}
                    isValid={isStep1Valid}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    proceedLabel="Proceed to Step 2"
                />
            </ProxyProvider>
        </Stack>
    )
}
