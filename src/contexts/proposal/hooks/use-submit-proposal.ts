import { useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type UseFormReturnType } from '@mantine/form'
import { useMutation } from '@/common'
import { onUpdateDraftStudyAction, finalizeStudySubmissionAction } from '@/server/actions/study-request'
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

    const mutation = useMutation({
        mutationFn: async () => {
            actionResult(await onUpdateDraftStudyAction({ studyId, studyInfo: buildStudyInfo(form.getValues()) }))
            return actionResult(await finalizeStudySubmissionAction({ studyId }))
        },
        onSuccess: (result) => {
            form.resetDirty()
            const event: SubmissionEvent = {
                type: 'proposal-submitted',
                studyId,
                submittedByTabId: tabSessionId,
                submittedByName: result.submitterFullName,
                orgName: result.orgName,
            }
            const payload = JSON.stringify(event)
            // Layer 1 — instant push to all connected peers.
            yjsForm.provider?.sendStateless(payload)
            // Layer 2 — sentinel persists in CRDT for briefly-disconnected peers.
            yjsForm.setSubmissionSentinel(event)
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
