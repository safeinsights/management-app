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

// Fields in visual/DOM order. The order IS the promise made to the user ("scroll to the first
// flagged field, reading top to bottom"), so it lives next to the validation that consumes it.
const FIELD_ORDER = [FEEDBACK_INPUT_ID, DECISION_GROUP_ID]

export function useOutputsDecision({ orgSlug, studyId, jobId, labName, decryptedFiles }: UseOutputsDecisionOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const [feedback, setFeedback] = useState('')
    const [selected, setSelected] = useState<OutputsDecision | null>(null)
    // One flag for both fields, raised only by a submit attempt. A pristine form must not open
    // with everything flagged red, and "still empty" is deliberately NOT raised on blur:
    //
    // rendering a message on blur inserts a line above the navigation row, and the blur that
    // inserts it is the one caused by mousedown on "Submit decision" itself. The button moves
    // ~21px between mousedown and mouseup, mouseup lands off it, and the browser fires click on
    // an ancestor instead, so this hook never runs and the reviewer has to click twice. Flagging
    // on submit alone is also what the AC asks for, and matches W3C ARIA guidance that a
    // required field should not be marked invalid before the user has tried to submit.
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
    // The decision the confirmation modal is confirming; null means closed. One nullable value
    // rather than an open flag beside the selection, so "open with nothing chosen" cannot be
    // represented and needs no guard.
    const [confirming, setConfirming] = useState<OutputsDecision | null>(null)

    // Both measured trimmed, through the shared counter, so the count beside the field and the rule
    // that gates it can never disagree (OTTER-737).
    const characterCount = countCharactersFromLexical(feedback)
    const isEmpty = !hasLexicalContent(feedback)
    const isOverLimit = characterCount > OUTPUTS_FEEDBACK_MAX_CHARACTERS

    // Over-limit is reported the moment it happens (the counter is already live, so a silent
    // field would contradict it), and it appears while the user types, well before any click.
    // Emptiness waits for a submit attempt.
    const resolveFeedbackError = () => {
        if (isOverLimit) return OUTPUTS_DECISION_ERRORS.feedbackTooLong
        if (hasAttemptedSubmit && isEmpty) return OUTPUTS_DECISION_ERRORS.feedbackEmpty(labName)
        return undefined
    }

    const feedbackError = resolveFeedbackError()
    const decisionError = hasAttemptedSubmit && selected === null ? OUTPUTS_DECISION_ERRORS.decisionMissing : undefined

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
            setConfirming(null)
            // push() alone would be a no-op here: /review is already the current URL, so the
            // decrypted review form would stay mounted with plaintext on screen even though the
            // decision is final. refresh() is what re-runs the server components and lets the
            // reviewer screen rules resolve to the post-decision screen.
            router.push(Routes.studyReview({ orgSlug, studyId }))
            router.refresh()
        },
    })

    // Flags every problem at once rather than stopping at the first: the user should see the
    // full set on one click, even though focus can only land on one of them. focusFirstInvalid
    // returns the field it moved to, so its own scan doubles as the "is anything invalid" test.
    const attemptSubmit = useCallback(() => {
        setHasAttemptedSubmit(true)

        const invalid: Record<string, boolean> = {
            [FEEDBACK_INPUT_ID]: isEmpty || isOverLimit,
            [DECISION_GROUP_ID]: selected === null,
        }

        if (focusFirstInvalid(FIELD_ORDER, (fieldId) => invalid[fieldId])) return

        setConfirming(selected)
    }, [isEmpty, isOverLimit, selected])

    // No error to clear: `decisionError` is derived from `selected`, so choosing an option drops
    // the message on its own.
    const onSelect = useCallback((next: OutputsDecision) => setSelected(next), [])

    // No null guard needed: the modal only exists while `confirming` holds a decision.
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
