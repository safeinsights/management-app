import { useCallback } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { onUpdateDraftStudyAction } from '@/server/actions/study-request'
import { reportMutationError } from '@/components/errors'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { buildStudyInfo, type TitleMode } from './build-study-info'

type Options = {
    /** Who owns `study.title` on this write. See {@link TitleMode}. */
    titleMode: TitleMode
}

export function useSaveProposalDraft(
    studyId: string,
    form: UseFormReturnType<ProposalFormValues>,
    { titleMode }: Options,
) {
    const mutation = useMutation({
        mutationFn: () => onUpdateDraftStudyAction({ studyId, studyInfo: buildStudyInfo(form.getValues(), titleMode) }),
        onSuccess: () => form.resetDirty(),
        onError: reportMutationError('Failed to save draft'),
    })

    const saveDraft = useCallback(async (): Promise<boolean> => {
        // A pristine form has nothing to flush. Skipping also keeps a failed
        // save from blocking back-navigation for a user who merely viewed the
        // page after the study became non-editable (e.g. a co-author resubmitted).
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
