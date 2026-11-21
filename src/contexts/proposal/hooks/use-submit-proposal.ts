import { useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type UseFormReturnType } from '@mantine/form'
import { showToast } from '@/components/toast-notifications'
import { useMutation } from '@/common'
import { finalizeStudySubmissionAction } from '@/server/actions/study-proposal.actions'
import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'

import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { buildStudyInfo } from './build-study-info'
import { useSaveProposalDraft } from './use-save-proposal-draft'
import { reportSubmissionFailure, SUBMIT_SUCCESS_TITLE } from './submission-toasts'

interface UseSubmitProposalOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    tabSessionId: string
}

export function useSubmitProposal({ studyId, form, tabSessionId }: UseSubmitProposalOptions) {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    // reportErrors false because the failure branch below folds the outcome into its own toast.
    const { saveDraft } = useSaveProposalDraft(studyId, form, { titleMode: 'omit', reportErrors: false })

    const mutation = useMutation({
        // One transactional UPDATE sets the snapshot and flips status; a separate pre-submit save
        // would let a losing concurrent submitter overwrite the winner between the two transactions.
        // 'omit' because Step 1 owns study.title, which this form's seeded copy would overwrite at
        // the moment it becomes immutable (OTTER-690).
        mutationFn: async () =>
            actionResult(
                await finalizeStudySubmissionAction({
                    studyId,
                    studyInfo: buildStudyInfo(form.getValues(), 'omit'),
                    originTabId: tabSessionId,
                }),
            ),
        onSuccess: () => {
            form.resetDirty()
            // Fired before the push: the provider is mounted at the root, and the navigation sweep
            // spares a toast younger than TOAST_NAVIGATION_GRACE_MS, so this one lands on the
            // destination page.
            showToast({ category: 'success', title: SUBMIT_SUCCESS_TITLE, message: '' })
            router.push(Routes.studySubmitted({ orgSlug, studyId }))
        },
        onError: (error) => reportSubmissionFailure(error, [saveDraft()]),
    })

    const submitProposal = useCallback(() => {
        const validation = form.validate()
        if (validation.hasErrors) return

        mutation.mutate()
    }, [form, mutation])

    return { submitProposal, isSubmitting: mutation.isPending }
}
