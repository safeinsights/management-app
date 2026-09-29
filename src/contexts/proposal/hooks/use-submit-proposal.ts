import { useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter, useParams } from 'next/navigation'
import { type UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation } from '@/common'
import { finalizeStudySubmissionAction } from '@/server/actions/study-request'
import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'

import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { type useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { type SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { buildStudyInfo } from './build-study-info'
import { useSaveProposalDraft } from './use-save-proposal-draft'
import { reportSubmissionFailure, SUBMIT_SUCCESS_TITLE } from './submission-toasts'

interface UseSubmitProposalOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    yjsForm: ReturnType<typeof useYjsFormMap>
    tabSessionId: string
}

export function useSubmitProposal({ studyId, form, yjsForm, tabSessionId }: UseSubmitProposalOptions) {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { user } = useUser()
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
                }),
            ),
        onSuccess: (result) => {
            form.resetDirty()
            // Fired before navigating: the Notifications provider lives in the persistent app
            // shell, so the toast survives the push and lands on the destination page.
            notifications.show({ color: 'green', title: SUBMIT_SUCCESS_TITLE, message: '' })
            const submittedByClerkId = user?.id
            if (!submittedByClerkId) {
                router.push(Routes.studySubmitted({ orgSlug, studyId }))
                return
            }
            const event: SubmissionEvent = {
                type: 'proposal-submitted',
                studyId,
                submittedByTabId: tabSessionId,
                submittedByClerkId,
                submittedByName: result.submitterFullName,
                orgName: result.orgName,
            }
            const payload = JSON.stringify(event)
            // Tabs that miss this fall through to the status poll mounted in the proposal form.
            yjsForm.provider?.sendStateless(payload)
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
