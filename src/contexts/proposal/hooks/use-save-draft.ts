import { useCallback, useRef, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { onUpdateDraftStudyAction } from '@/server/actions/study-request'
import { DEFAULT_DRAFT_TITLE, type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

export function buildStudyInfo(values: ProposalFormValues) {
    return {
        title: values.title || DEFAULT_DRAFT_TITLE,
        piName: values.piName || undefined,
        piUserId: values.piUserId || undefined,
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
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
    // Auto-save calls saveDraft({ silent: true }) so the toast doesn't fire every 2.5s.
    // Explicit clicks still get the toast confirmation.
    const isSilentRef = useRef(false)

    const mutation = useMutation({
        mutationFn: () => onUpdateDraftStudyAction({ studyId, studyInfo: buildStudyInfo(form.getValues()) }),
        onSuccess: () => {
            form.resetDirty()
            setLastSavedAt(new Date())
            if (!isSilentRef.current) {
                notifications.show({
                    title: 'Draft Saved',
                    message: 'Your study proposal has been saved as a draft.',
                    color: 'green',
                })
            }
        },
        onError: (error) => {
            notifications.show({
                title: 'Failed to save draft',
                message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
                color: 'red',
            })
        },
    })

    const saveDraft = useCallback(
        async (opts?: { silent?: boolean }) => {
            isSilentRef.current = opts?.silent ?? false
            try {
                await mutation.mutateAsync()
                return true
            } catch {
                return false
            }
        },
        [mutation],
    )

    return { saveDraft, isSaving: mutation.isPending, lastSavedAt }
}
