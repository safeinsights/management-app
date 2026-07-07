import { useCallback } from 'react'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { onUpdateClarifiedProposalAction } from '@/server/actions/study-request'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { buildStudyInfo } from '@/contexts/proposal/hooks/build-study-info'

// Persists proposal field edits on explicit "Save as draft" clicks. The
// resubmission note is captured in client state and only sent when
// resubmitProposalAction runs.
interface UseResubmitSaveDraftOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
}

export function useResubmitSaveDraft({ studyId, form }: UseResubmitSaveDraftOptions) {
    const mutation = useMutation({
        mutationFn: () =>
            onUpdateClarifiedProposalAction({
                studyId,
                studyInfo: buildStudyInfo(form.getValues()),
            }),
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
