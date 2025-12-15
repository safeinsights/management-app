'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Group } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import ProxyProvider from '@/components/proxy-provider'
import { Routes } from '@/lib/routes'
import { useProposalForm, isProposalFormValid, type DraftData } from '@/hooks/use-proposal-form'
import { useSaveDraft } from '@/hooks/use-save-draft'
import { useStudyRequestStore } from '@/stores/study-request.store'
import { StudyProposalForm } from './study-proposal-form'

interface StudyProposalProps {
    studyId?: string
    draftData?: DraftData | null
}

export const StudyProposal: React.FC<StudyProposalProps> = ({ studyId, draftData }) => {
    const router = useRouter()
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()
    const store = useStudyRequestStore()
    const { form, existingFiles } = useProposalForm(draftData)
    const { saveDraft, isSaving } = useSaveDraft()

    useEffect(() => {
        if (studyId) store.setStudyId(studyId)
        store.setSubmittingOrgSlug(submittingOrgSlug)
    }, [studyId, submittingOrgSlug, store])

    const handleSaveAndProceed = () => {
        saveDraft(form.getValues(), {
            onSuccess: ({ studyId: newStudyId }) => {
                form.resetDirty()
                router.push(Routes.studyCode({ orgSlug: submittingOrgSlug, studyId: newStudyId }))
            },
        })
    }

    const handleSaveDraftOnly = () => {
        saveDraft(form.getValues(), {
            onSuccess: ({ studyId: newStudyId }) => {
                form.resetDirty()
                if (!studyId) {
                    window.history.replaceState(null, '', Routes.studyEdit({ orgSlug: submittingOrgSlug, studyId: newStudyId }))
                }
                notifications.show({
                    title: 'Draft Saved',
                    message: 'Your study proposal has been saved as a draft.',
                    color: 'green',
                })
            },
        })
    }

    const isValid = isProposalFormValid(form.getValues(), existingFiles)

    return (
        <ProxyProvider
            isDirty={form.isDirty()}
            onSaveDraft={() =>
                new Promise<void>((resolve, reject) => {
                    saveDraft(form.getValues(), {
                        onSuccess: () => {
                            form.resetDirty()
                            resolve()
                        },
                        onError: (error) => reject(error),
                    })
                })
            }
            isSavingDraft={isSaving}
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
                        onClick={handleSaveDraftOnly}
                    >
                        Save as draft
                    </Button>
                    <Button
                        type="button"
                        size="md"
                        variant="primary"
                        disabled={!isValid || isSaving}
                        loading={isSaving}
                        onClick={handleSaveAndProceed}
                    >
                        Save and proceed to code upload
                    </Button>
                </Group>
            </Group>
        </ProxyProvider>
    )
}
