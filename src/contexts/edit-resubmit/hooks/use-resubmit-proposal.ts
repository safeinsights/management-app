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
import { useSaveProposalDraft } from '@/contexts/proposal/hooks/use-save-proposal-draft'
import { reportSubmissionFailure, SUBMIT_SUCCESS_TITLE } from '@/contexts/proposal/hooks/submission-toasts'

interface UseResubmitProposalOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    noteForm: UseFormReturnType<ResubmitNoteValue>
    yjsForm: ReturnType<typeof useYjsFormMap>
    tabSessionId: string
    /** Flushes the note draft; the failure branch relies on it so the toast can promise the work is saved. */
    flushNote: () => Promise<boolean>
}

export function useResubmitProposal({
    studyId,
    form,
    noteForm,
    yjsForm,
    tabSessionId,
    flushNote,
}: UseResubmitProposalOptions) {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    // reportErrors false because the failure branch below folds the outcome into its own toast.
    const { saveDraft } = useSaveProposalDraft(studyId, form, { titleMode: 'omit', reportErrors: false })

    const mutation = useMutation({
        // 'omit' because this page no longer renders the title (OTTER-762): sending the seeded copy
        // back would let a stale value overwrite the stored one at the moment it becomes immutable.
        mutationFn: async () =>
            actionResult(
                await resubmitProposalAction({
                    studyId,
                    studyInfo: buildStudyInfo(form.getValues(), 'omit'),
                    resubmissionNote: noteForm.values.resubmissionNote,
                }),
            ),
        onSuccess: (result) => {
            form.resetDirty()
            noteForm.resetDirty()
            // Fired before navigating: the Notifications provider lives in the persistent app
            // shell, so the toast survives the push and lands on the destination page.
            notifications.show({ color: 'green', title: SUBMIT_SUCCESS_TITLE, message: '' })
            const event: SubmissionEvent = {
                type: 'proposal-submitted',
                studyId,
                submittedByTabId: tabSessionId,
                submittedByClerkId: result.submitterClerkId,
                submittedByName: result.submitterFullName,
                orgName: result.orgName,
            }
            // The action has already flipped status to PENDING-REVIEW, so the editor service
            // accepts this event; peers that miss it fall through to the status poll.
            yjsForm.provider?.sendStateless(JSON.stringify(event))
            router.push(Routes.studySubmitted({ orgSlug, studyId }))
        },
        onError: (error) => reportSubmissionFailure(error, [saveDraft(), flushNote()]),
    })

    const resubmit = useCallback(() => {
        const proposalValidation = form.validate()
        const noteValidation = noteForm.validate()
        if (proposalValidation.hasErrors || noteValidation.hasErrors) return

        mutation.mutate()
    }, [form, noteForm, mutation])

    return { resubmit, isSubmitting: mutation.isPending }
}
