'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { DECISION_GROUP_ID, FEEDBACK_INPUT_ID } from '@/components/study/outputs-decision-section'
import { countWordsFromLexical } from '@/lib/lexical'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { buildSharedFiles } from '@/lib/re-wrap-results'
import { actionResult } from '@/lib/utils'
import { OUTPUTS_DECISION_ERRORS, OUTPUTS_FEEDBACK_MIN_WORDS, type OutputsDecision } from '@/lib/outputs-review'
import type { JobFileInfo } from '@/lib/types'
import { submitOutputsDecisionAction } from '@/server/actions/study-job.actions'

type UseOutputsDecisionOptions = {
    orgSlug: string
    studyId: string
    jobId: string
    labName: string
    maxWords: number
    decryptedFiles: JobFileInfo[]
}

// Fields in visual/DOM order. The order IS the promise made to the user ("scroll to the first
// flagged field, reading top to bottom"), so it lives next to the validation that consumes it.
const FIELD_ORDER = [FEEDBACK_INPUT_ID, DECISION_GROUP_ID]

export function useOutputsDecision({
    orgSlug,
    studyId,
    jobId,
    labName,
    maxWords,
    decryptedFiles,
}: UseOutputsDecisionOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const [feedback, setFeedback] = useState('')
    const [selected, setSelected] = useState<OutputsDecision | null>(null)
    // Errors surface only after the user has left a field or pressed Submit; a pristine form
    // must not open with everything flagged red.
    const [showFeedbackError, setShowFeedbackError] = useState(false)
    const [showDecisionError, setShowDecisionError] = useState(false)
    // The server refresh can finish later under load, so remove controls as soon as the action succeeds.
    const [isSubmitted, setIsSubmitted] = useState(false)
    // The decision the confirmation modal is confirming; null means closed. One nullable value
    // rather than an open flag beside the selection, so "open with nothing chosen" cannot be
    // represented and needs no guard.
    const [confirming, setConfirming] = useState<OutputsDecision | null>(null)

    const wordCount = countWordsFromLexical(feedback)
    const isEmpty = wordCount < OUTPUTS_FEEDBACK_MIN_WORDS
    const isOverLimit = wordCount > maxWords

    // Over-limit is reported the moment it happens (the counter is already live, so a silent
    // field would contradict it); emptiness waits for blur or a submit attempt.
    const resolveFeedbackError = () => {
        if (isOverLimit) return OUTPUTS_DECISION_ERRORS.feedbackTooLong(maxWords)
        if (showFeedbackError && isEmpty) return OUTPUTS_DECISION_ERRORS.feedbackEmpty(labName)
        return undefined
    }

    const feedbackError = resolveFeedbackError()
    const decisionError = showDecisionError && selected === null ? OUTPUTS_DECISION_ERRORS.decisionMissing : undefined

    const { mutate: submit, isPending } = useMutation({
        mutationFn: async (decision: OutputsDecision) => {
            // Only the sharing branch re-wraps: withholding the files means there is nothing to
            // grant the lab access to, and buildSharedFiles would throw on a missing AES key.
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
        onError: reportMutationError('Failed to submit your decision'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            setIsSubmitted(true)
            setConfirming(null)
            // The current URL is already /review. A same-URL push can race this refresh and leave
            // the decrypted form mounted after the decision commits.
            router.refresh()
        },
    })

    // Flags every problem at once rather than stopping at the first: the user should see the
    // full set on one click, even though focus can only land on one of them. focusFirstInvalid
    // returns the field it moved to, so its own scan doubles as the "is anything invalid" test.
    const attemptSubmit = useCallback(() => {
        setShowFeedbackError(true)
        setShowDecisionError(true)

        const invalid: Record<string, boolean> = {
            [FEEDBACK_INPUT_ID]: isEmpty || isOverLimit,
            [DECISION_GROUP_ID]: selected === null,
        }

        if (focusFirstInvalid(FIELD_ORDER, (fieldId) => invalid[fieldId])) return

        setConfirming(selected)
    }, [isEmpty, isOverLimit, selected])

    const onSelect = useCallback((next: OutputsDecision) => {
        setSelected(next)
        setShowDecisionError(false)
    }, [])

    // No null guard needed: the modal only exists while `confirming` holds a decision.
    const confirmSubmit = useCallback(() => {
        if (confirming) submit(confirming)
    }, [confirming, submit])

    return {
        feedback,
        onFeedbackChange: setFeedback,
        onFeedbackBlur: () => setShowFeedbackError(true),
        feedbackError,
        wordCount,
        selected,
        onSelect,
        onDecisionBlur: () => setShowDecisionError(true),
        decisionError,
        confirming,
        closeModal: () => setConfirming(null),
        attemptSubmit,
        confirmSubmit,
        isSubmitting: isPending,
        isSubmitted,
    }
}
