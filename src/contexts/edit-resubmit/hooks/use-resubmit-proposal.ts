import { useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { showToast } from '@/components/toast-notifications'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { resubmitProposalAction } from '@/server/actions/proposal-resubmission.actions'
import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { type ResubmitNoteValue } from '@/schema/resubmission-note'
import { buildStudyInfo } from '@/contexts/proposal/hooks/build-study-info'
import { useSaveProposalDraft } from '@/contexts/proposal/hooks/use-save-proposal-draft'
import { reportSubmissionFailure, SUBMIT_SUCCESS_TITLE } from '@/contexts/proposal/hooks/submission-toasts'

interface UseResubmitProposalOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    noteForm: UseFormReturnType<ResubmitNoteValue>
    tabSessionId: string
    /** Flushes the note draft; the failure branch relies on it so the toast can promise the work is saved. */
    flushNote: () => Promise<boolean>
}

export function useResubmitProposal({ studyId, form, noteForm, tabSessionId, flushNote }: UseResubmitProposalOptions) {
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
                    originTabId: tabSessionId,
                }),
            ),
        onSuccess: () => {
            form.resetDirty()
            noteForm.resetDirty()
            // Fired before the push: the provider is mounted at the root, and the navigation sweep
            // spares a toast younger than TOAST_NAVIGATION_GRACE_MS, so this one lands on the
            // destination page.
            showToast({ category: 'success', title: SUBMIT_SUCCESS_TITLE, message: '' })
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
