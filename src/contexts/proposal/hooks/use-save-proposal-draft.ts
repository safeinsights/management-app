import { useCallback } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { onUpdateDraftStudyAction } from '@/server/actions/study-request'
import { reportMutationError } from '@/components/errors'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { buildStudyInfo, type TitleMode } from './build-study-info'

type Options = {
    titleMode: TitleMode
    /** Set false when the caller reports the failure itself, so two toasts don't read as two problems. */
    reportErrors?: boolean
}

export function useSaveProposalDraft(
    studyId: string,
    form: UseFormReturnType<ProposalFormValues>,
    { titleMode, reportErrors = true }: Options,
) {
    const mutation = useMutation({
        mutationFn: () => onUpdateDraftStudyAction({ studyId, studyInfo: buildStudyInfo(form.getValues(), titleMode) }),
        onSuccess: () => form.resetDirty(),
        onError: reportErrors ? reportMutationError('Failed to save draft') : undefined,
    })

    const saveDraft = useCallback(async (): Promise<boolean> => {
        // Skipping a pristine form also keeps a failed save from blocking back-navigation for a
        // user who merely viewed a study that has since become non-editable.
        if (!form.isDirty()) return true
        try {
            await mutation.mutateAsync()
            return true
        } catch {
            return false
        }
    }, [mutation, form])

    return { saveDraft, isSaving: mutation.isPending }
}
