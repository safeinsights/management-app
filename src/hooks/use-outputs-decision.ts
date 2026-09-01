'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { DECISION_GROUP_ID, FEEDBACK_INPUT_ID } from '@/components/study/outputs-decision-section'
import { countCharactersFromLexical, hasLexicalContent } from '@/lib/lexical'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { buildSharedFiles } from '@/lib/re-wrap-results'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { OUTPUTS_DECISION_ERRORS, OUTPUTS_FEEDBACK_MAX_CHARACTERS, type OutputsDecision } from '@/lib/outputs-review'
import type { JobFileInfo } from '@/lib/types'
import { submitOutputsDecisionAction } from '@/server/actions/study-job.actions'

type UseOutputsDecisionOptions = {
    orgSlug: string
    studyId: string
    jobId: string
    labName: string
    decryptedFiles: JobFileInfo[]
}

// Visual/DOM order, which is what "focus the first flagged field" means to the user.
const FIELD_ORDER = [FEEDBACK_INPUT_ID, DECISION_GROUP_ID]

export function useOutputsDecision({ orgSlug, studyId, jobId, labName, decryptedFiles }: UseOutputsDecisionOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const [feedback, setFeedback] = useState('')
    const [selected, setSelected] = useState<OutputsDecision | null>(null)
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
        onError: reportMutationError('Failed to submit your decision'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            setConfirming(null)
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

    const onSelect = useCallback((next: OutputsDecision) => setSelected(next), [])

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
