import { useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter, useParams } from 'next/navigation'
import { type UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { captureException } from '@sentry/nextjs'
import { useMutation } from '@/common'
import { finalizeStudySubmissionAction } from '@/server/actions/study-request'
import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'

import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { type useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { type SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { buildStudyInfo } from './build-study-info'
import { useSaveProposalDraft } from './use-save-proposal-draft'

export const SUBMIT_SUCCESS_TITLE = 'Proposal submitted'
export const SUBMIT_FAILURE_TITLE = 'Proposal could not be submitted'
export const SUBMIT_FAILURE_MESSAGE = 'Your work is saved. Try again.'
/**
 * Replaces {@link SUBMIT_FAILURE_MESSAGE} when the recovery save fails too, which is the likely
 * case when the outage that failed the submit is the network. Telling the user their work is safe
 * when it is not is the one thing this path must not do.
 */
export const SUBMIT_FAILURE_UNSAVED_MESSAGE = 'We could not save your work. Keep this tab open and try again.'

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
    // titleMode 'omit' for the same reason the submit below uses it: Step 1 owns study.title.
    // reportErrors false: the failure branch below folds the outcome into its own toast.
    const { saveDraft } = useSaveProposalDraft(studyId, form, { titleMode: 'omit', reportErrors: false })

    const mutation = useMutation({
        // Atomic submit: a single transactional UPDATE in finalizeStudySubmissionAction
        // sets the field snapshot AND flips status. A separate pre-submit
        // onUpdateDraftStudyAction would let a losing concurrent submitter overwrite
        // the winner's data between the two transactions.
        // titleMode 'omit': Step 1 owns study.title on a DRAFT (OTTER-690). This form still carries
        // a seeded copy for the reviewer preview, and sending it would overwrite the Step 1 value
        // at the exact moment it becomes immutable.
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
            // shell, so the toast survives the client-side push and lands on the page the user
            // arrives at.
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
            // Instant push to all connected peers; tabs that miss it fall through to
            // the 10-second status poll mounted in the proposal form.
            yjsForm.provider?.sendStateless(payload)
            router.push(Routes.studySubmitted({ orgSlug, studyId }))
        },
        onError: async (error) => {
            // Not reportError: that appends a Sentry reference id to the message, and the card
            // specifies this copy exactly. Sentry still gets the exception.
            captureException(error)

            // Awaited before the toast, not fired alongside it. A failed submit writes nothing
            // (finalizeStudySubmissionAction is one transaction) and in single-user mode there is
            // no Yjs autosave behind it either, so this flush is what decides whether the work is
            // actually saved, so the message has to report that outcome rather than assume it.
            const saved = await saveDraft()
            notifications.show({
                color: 'red',
                title: SUBMIT_FAILURE_TITLE,
                message: saved ? SUBMIT_FAILURE_MESSAGE : SUBMIT_FAILURE_UNSAVED_MESSAGE,
            })

            // The confirmation modal closes as the mutation settles, leaving the user back on the
            // form with every value intact. Put the Submit button back in view so retrying does not
            // start with a scroll.
            window.scrollTo?.({ top: document.body.scrollHeight, behavior: 'smooth' })
        },
    })

    const submitProposal = useCallback(() => {
        const validation = form.validate()
        if (validation.hasErrors) return

        mutation.mutate()
    }, [form, mutation])

    return { submitProposal, isSubmitting: mutation.isPending }
}
