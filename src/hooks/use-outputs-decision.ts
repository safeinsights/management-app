'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { captureException } from '@sentry/nextjs'
import { useMutation, useQueryClient } from '@/common'
import { DECISION_GROUP_ID, FEEDBACK_INPUT_ID } from '@/components/study/outputs-decision-section'
import { showOutputsDecisionFailure } from '@/components/study/outputs-decision-failure-notice'
import { countCharactersFromLexical, hasLexicalContent } from '@/lib/lexical'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { buildSharedFiles } from '@/lib/re-wrap-results'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { useBroadcastProvider } from '@/hooks/use-broadcast-provider'
import { useOutputsDecisionMap } from '@/hooks/use-outputs-decision-map'
import { useOutputsReviewFeedbackProvider } from '@/lib/realtime/outputs-review-feedback-provider-context'
import { useTriggerStudyKickOut } from '@/hooks/use-study-status-on-reconnect'
import type { SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { OUTPUTS_DECISION_ERRORS, OUTPUTS_FEEDBACK_MAX_CHARACTERS, type OutputsDecision } from '@/lib/outputs-review'
import type { JobFileInfo } from '@/lib/types'
import { submitOutputsDecisionAction } from '@/server/actions/study-job.actions'

type UseOutputsDecisionOptions = {
    orgSlug: string
    studyId: string
    jobId: string
    labName: string
    decryptedFiles: JobFileInfo[]
    /** Distinguishes this tab from the same reviewer's other tabs, which are peers, not the author. */
    tabSessionId: string
}

// Visual/DOM order, which is what "focus the first flagged field" means to the user.
const FIELD_ORDER = [FEEDBACK_INPUT_ID, DECISION_GROUP_ID]

export function useOutputsDecision({
    orgSlug,
    studyId,
    jobId,
    labName,
    decryptedFiles,
    tabSessionId,
}: UseOutputsDecisionOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { user } = useUser()
    // The editor's own provider answers whether the feedback reached the service; the broadcast
    // goes out on its own connection, which the action's document delete cannot take with it.
    const provider = useOutputsReviewFeedbackProvider()
    const broadcastProvider = useBroadcastProvider(outputsReviewFeedbackDocName(jobId))
    const triggerKickOut = useTriggerStudyKickOut()

    // The feedback lives in the collaborative document, so it is safe once the editor service has
    // taken every local change. With no provider it exists only on this screen.
    const isFeedbackSaved = () => provider !== null && provider.unsyncedChanges === 0

    const [feedback, setFeedback] = useState('')
    const [selected, setSelected] = useState<OutputsDecision | null>(null)
    // The feedback restores itself from the collaborative document; the radio needs this (OTTER-758).
    const { pushDecision } = useOutputsDecisionMap({ provider, selected, onRestore: setSelected })
    // Not raised on blur: the message inserts a line that shifts "Submit decision" between
    // mousedown and mouseup, so the click misses and the reviewer has to click twice.
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
    // One nullable value rather than an open flag beside the selection, so "open with nothing
    // chosen" cannot be represented.
    const [confirming, setConfirming] = useState<OutputsDecision | null>(null)

    // Through the shared counter so the displayed count and the rule gating it cannot disagree
    // (OTTER-737).
    const characterCount = countCharactersFromLexical(feedback)
    const isEmpty = !hasLexicalContent(feedback)
    const isOverLimit = characterCount > OUTPUTS_FEEDBACK_MAX_CHARACTERS

    // Over-limit reports immediately because the counter is already live; emptiness waits for a
    // submit attempt.
    const resolveFeedbackError = () => {
        if (isOverLimit) return OUTPUTS_DECISION_ERRORS.feedbackTooLong
        if (hasAttemptedSubmit && isEmpty) return OUTPUTS_DECISION_ERRORS.feedbackEmpty(labName)
        return undefined
    }

    const feedbackError = resolveFeedbackError()
    const decisionError = hasAttemptedSubmit && selected === null ? OUTPUTS_DECISION_ERRORS.decisionMissing : undefined

    const { mutate: submit, isPending } = useMutation({
        mutationFn: async (decision: OutputsDecision) => {
            // Only the sharing branch re-wraps; buildSharedFiles would throw on a missing AES key.
            const sharedFiles = decision === 'share-outputs' ? await buildSharedFiles(studyId, decryptedFiles) : []

            return actionResult(
                await submitOutputsDecisionAction({
                    orgSlug,
                    studyJobId: jobId,
                    decision,
                    feedback,
                    sharedFiles,
                }),
            )
        },
        onError: async (error) => {
            // Not reportMutationError: that appends a Sentry reference to copy the card specifies
            // exactly, and an action id is not something the reviewer can act on.
            captureException(error)
            setConfirming(null)

            // A peer may have decided while this submit was in flight, which closes the round for
            // everyone and makes a retry impossible. Reconcile against the job before blaming the
            // submit, and never replay the mutation. Quiet, because this screen answers a failed
            // check with its own wording below, which names what a reload costs the reviewer.
            if (await triggerKickOut({ reportFailure: false })) return

            showOutputsDecisionFailure({ error, isSaved: isFeedbackSaved() })
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            setConfirming(null)

            // Closes the review in the other tabs at once. The editor service relays this only for
            // a job that already carries its decision, so it cannot end a peer's review early.
            const submittedByClerkId = user?.id
            if (broadcastProvider && submittedByClerkId) {
                const event: SubmissionEvent = {
                    type: 'outputs-review-submitted',
                    studyId,
                    submittedByTabId: tabSessionId,
                    submittedByClerkId,
                    submittedByName: result.submitterFullName,
                }
                broadcastProvider.sendStateless(JSON.stringify(event))
            }

            // push() alone is a no-op since /review is already the URL, leaving the decrypted form
            // mounted with plaintext on screen; refresh() re-runs the server components.
            router.push(Routes.studyReview({ orgSlug, studyId }))
            router.refresh()
        },
    })

    const attemptSubmit = useCallback(() => {
        setHasAttemptedSubmit(true)

        const invalid: Record<string, boolean> = {
            [FEEDBACK_INPUT_ID]: isEmpty || isOverLimit,
            [DECISION_GROUP_ID]: selected === null,
        }

        if (focusFirstInvalid(FIELD_ORDER, (fieldId) => invalid[fieldId])) return

        setConfirming(selected)
    }, [isEmpty, isOverLimit, selected])

    const onSelect = useCallback(
        (next: OutputsDecision) => {
            setSelected(next)
            pushDecision(next)
        },
        [pushDecision],
    )

    const confirmSubmit = useCallback(() => {
        if (confirming) submit(confirming)
    }, [confirming, submit])

    return {
        feedback,
        onFeedbackChange: setFeedback,
        feedbackError,
        characterCount,
        selected,
        onSelect,
        decisionError,
        confirming,
        closeModal: () => setConfirming(null),
        attemptSubmit,
        confirmSubmit,
        isSubmitting: isPending,
    }
}
