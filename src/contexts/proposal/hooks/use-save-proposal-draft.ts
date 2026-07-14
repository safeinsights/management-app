import { useCallback } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { onUpdateDraftStudyAction } from '@/server/actions/study-request'
import { reportMutationError } from '@/components/errors'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { buildStudyInfo } from './build-study-info'

type Options = {
    /**
     * Leave the title column untouched when the form title is blank. The
     * resubmit flow needs this: buildStudyInfo maps a blank title to null, and
     * a NULL title on a CHANGE-REQUESTED row violates the
     * study_title_required_when_not_draft check constraint.
     */
    omitBlankTitle?: boolean
}

export function useSaveProposalDraft(
    studyId: string,
    form: UseFormReturnType<ProposalFormValues>,
    { omitBlankTitle = false }: Options = {},
) {
    const mutation = useMutation({
        mutationFn: () => {
            const { title, ...rest } = buildStudyInfo(form.getValues())
            const studyInfo = omitBlankTitle && title === null ? rest : { title, ...rest }
            return onUpdateDraftStudyAction({ studyId, studyInfo })
        },
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
