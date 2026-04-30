import { useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter, useParams } from 'next/navigation'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { finalizeStudySubmissionAction } from '@/server/actions/study-request'
import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'
import { reportMutationError } from '@/components/errors'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { type useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { type SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { buildStudyInfo } from './use-save-draft'

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

    const mutation = useMutation({
        // Atomic submit: a single transactional UPDATE in finalizeStudySubmissionAction
        // sets the field snapshot AND flips status. A separate pre-submit
        // onUpdateDraftStudyAction would let a losing concurrent submitter overwrite
        // the winner's data between the two transactions.
        mutationFn: async () =>
            actionResult(await finalizeStudySubmissionAction({ studyId, studyInfo: buildStudyInfo(form.getValues()) })),
        onSuccess: (result) => {
            form.resetDirty()
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
            // Instant push to all connected peers; tabs that miss it fall through to
            // the 10-second status poll mounted in the proposal form.
            yjsForm.provider?.sendStateless(payload)
            router.push(Routes.studySubmitted({ orgSlug, studyId }))
        },
        onError: reportMutationError('Failed to submit proposal'),
    })

    const submitProposal = useCallback(() => {
        const validation = form.validate()
        if (validation.hasErrors) return

        mutation.mutate()
    }, [form, mutation])

    return { submitProposal, isSubmitting: mutation.isPending }
}
