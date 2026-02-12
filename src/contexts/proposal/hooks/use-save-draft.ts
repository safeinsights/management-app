import { useCallback, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { onUpdateDraftStudyAction } from '@/server/actions/study-request'
import { actionResult } from '@/lib/utils'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

function buildStudyInfo(values: ProposalFormValues) {
    return {
        title: values.title || undefined,
        piName: values.piName || undefined,
        datasets: values.datasets,
        researchQuestions: values.researchQuestions || undefined,
        projectSummary: values.projectSummary || undefined,
        impact: values.impact || undefined,
        additionalNotes: values.additionalNotes || undefined,
    }
}

interface UseSaveDraftOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
}

export function useSaveDraft({ studyId, form }: UseSaveDraftOptions) {
    const [isSaving, setIsSaving] = useState(false)

    const saveDraft = useCallback(async () => {
        setIsSaving(true)
        try {
            actionResult(await onUpdateDraftStudyAction({ studyId, studyInfo: buildStudyInfo(form.getValues()) }))
            form.resetDirty()
            notifications.show({
                title: 'Draft Saved',
                message: 'Your study proposal has been saved as a draft.',
                color: 'green',
            })
        } catch (error) {
            notifications.show({
                title: 'Failed to save draft',
                message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
                color: 'red',
            })
        } finally {
            setIsSaving(false)
        }
    }, [studyId, form])

    return { saveDraft, isSaving, buildStudyInfo }
}
