import { useCallback, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { onUpdateClarifiedProposalAction } from '@/server/actions/study-request'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { buildStudyInfo } from '@/contexts/proposal/hooks/use-save-draft'

// Auto-saves only the proposal field edits. The resubmission note is
// captured in client state and persisted in resubmitProposalAction.
interface UseResubmitSaveDraftOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
}

export function useResubmitSaveDraft({ studyId, form }: UseResubmitSaveDraftOptions) {
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

    const mutation = useMutation({
        mutationFn: () =>
            onUpdateClarifiedProposalAction({
                studyId,
                studyInfo: buildStudyInfo(form.getValues()),
            }),
        onSuccess: () => {
            form.resetDirty()
            setLastSavedAt(new Date())
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

    return { saveDraft, isSaving: mutation.isPending, lastSavedAt }
}
