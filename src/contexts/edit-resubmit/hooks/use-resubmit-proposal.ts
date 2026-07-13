import { useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { resubmitProposalAction } from '@/server/actions/study-request'
import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { type ResubmitNoteValue } from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { type useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { type SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { buildStudyInfo } from '@/contexts/proposal/hooks/build-study-info'

interface UseResubmitProposalOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    noteForm: UseFormReturnType<ResubmitNoteValue>
    yjsForm: ReturnType<typeof useYjsFormMap>
    tabSessionId: string
}

export function useResubmitProposal({ studyId, form, noteForm, yjsForm, tabSessionId }: UseResubmitProposalOptions) {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const mutation = useMutation({
        mutationFn: async () =>
            actionResult(
                await resubmitProposalAction({
                    studyId,
                    studyInfo: buildStudyInfo(form.getValues()),
                    resubmissionNote: noteForm.values.resubmissionNote,
                }),
            ),
        onSuccess: (result) => {
            form.resetDirty()
            noteForm.resetDirty()
            const event: SubmissionEvent = {
                type: 'proposal-submitted',
                studyId,
                submittedByTabId: tabSessionId,
                submittedByClerkId: result.submitterClerkId,
                submittedByName: result.submitterFullName,
                orgName: result.orgName,
            }
            // The action has already flipped status to PENDING-REVIEW, so the
            // editor service accepts this stateless event on the proposal-fields
            // doc. Peers that miss it fall through to the status poll mounted in
            // the resubmit form. Mirrors the draft submit flow.
            yjsForm.provider?.sendStateless(JSON.stringify(event))
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
