'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import ProxyProvider from '@/components/proxy-provider'
import { Routes } from '@/lib/routes'
import { useStudyRequest } from '@/contexts/study-request'
import { StudyProposalForm } from './proposal-form'
import type { DraftStudyData } from '@/contexts/study-request'

interface StudyProposalProps {
    studyId?: string
    draftData?: DraftStudyData | null
}

export const StudyProposal: React.FC<StudyProposalProps> = ({ studyId, draftData }) => {
    const router = useRouter()
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()
    const { form, existingFiles, isFormValid, saveDraft, isSaving, reset, initFromDraft } = useStudyRequest()

    useEffect(() => {
        if (draftData) {
            initFromDraft(draftData, submittingOrgSlug)
        } else {
            // Reset store when arriving, optionally preserving studyId for existing drafts
            reset(studyId)
        }
    }, [studyId, submittingOrgSlug, reset, initFromDraft, draftData])

    const handleSave = (proceed: boolean) => {
        saveDraft({
            onSuccess: ({ studyId: newStudyId }) => {
                form.resetDirty()
                if (proceed) {
                    router.push(Routes.studyCode({ orgSlug: submittingOrgSlug, studyId: newStudyId }))
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
        })
    }

    return (
        <ProxyProvider
            isDirty={form.isDirty()}
            onSaveDraft={() =>
                new Promise<void>((resolve, reject) => {
                    saveDraft({
                        onSuccess: () => {
                            form.resetDirty()
                            resolve()
                        },
                        onError: (error) => reject(error),
                    })
                })
            }
            isSavingDraft={isSaving}
            onNavigateAway={() => reset()}
        >
            <StudyProposalForm studyProposalForm={form} existingFiles={existingFiles} />

            <Group mt="xxl" style={{ width: '100%' }}>
                <Group style={{ marginLeft: 'auto' }}>
                    <Button
                        type="button"
                        variant="outline"
                        size="md"
                        disabled={!form.isDirty() || isSaving}
                        loading={isSaving}
                        onClick={() => handleSave(false)}
                    >
                        Save as draft
                    </Button>
                    <Button
                        type="button"
                        size="md"
                        variant="primary"
                        disabled={!isFormValid || isSaving}
                        loading={isSaving}
                        onClick={() => handleSave(true)}
                    >
                        Save and proceed to code upload
                    </Button>
                </Group>
            </Group>
        </ProxyProvider>
    )
}
