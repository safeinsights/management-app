import { useCallback } from 'react'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { onUpdateDraftStudyAction } from '@/server/actions/study-request'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

export function buildStudyInfo(values: ProposalFormValues) {
    return {
        title: values.title || 'Untitled Draft',
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
    const mutation = useMutation({
        mutationFn: () => onUpdateDraftStudyAction({ studyId, studyInfo: buildStudyInfo(form.getValues()) }),
        onSuccess: () => {
            form.resetDirty()
            notifications.show({
                title: 'Draft Saved',
                message: 'Your study proposal has been saved as a draft.',
                color: 'green',
            })
        },
        onError: (error) => {
            notifications.show({
                title: 'Failed to save draft',
                message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
                color: 'red',
            })
        },
    })

    const saveDraft = useCallback(async () => {
        try {
            await mutation.mutateAsync()
            return true
        } catch {
            return false
        }
    }, [mutation])

    return { saveDraft, isSaving: mutation.isPending }
}
