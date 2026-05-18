import { useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { resubmitProposalAction } from '@/server/actions/study-request'
import { Routes } from '@/lib/routes'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { type ResubmitNoteValue } from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { buildStudyInfo } from '@/contexts/proposal/hooks/use-save-draft'

interface UseResubmitProposalOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    noteForm: UseFormReturnType<ResubmitNoteValue>
}

export function useResubmitProposal({ studyId, form, noteForm }: UseResubmitProposalOptions) {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const mutation = useMutation({
        mutationFn: () =>
            resubmitProposalAction({
                studyId,
                studyInfo: buildStudyInfo(form.getValues()),
                resubmissionNote: noteForm.values.resubmissionNote,
            }),
        onSuccess: () => {
            form.resetDirty()
            noteForm.resetDirty()
            router.push(Routes.studySubmitted({ orgSlug, studyId }))
        },
        onError: (error) => {
            notifications.show({
                title: 'Failed to resubmit proposal',
                message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
                color: 'red',
            })
        },
    })

    const resubmit = useCallback(() => {
        const proposalValidation = form.validate()
        const noteValidation = noteForm.validate()
        if (proposalValidation.hasErrors || noteValidation.hasErrors) return

        mutation.mutate()
    }, [form, noteForm, mutation])

    return { resubmit, isSubmitting: mutation.isPending }
}
