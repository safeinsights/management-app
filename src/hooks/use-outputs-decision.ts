'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { captureException } from '@sentry/nextjs'
import { useMutation, useQueryClient } from '@/common'
import { DECISION_GROUP_ID, FEEDBACK_INPUT_ID } from '@/components/study/outputs-decision-section'
import { useOutputsDecisionCoordination } from '@/components/study/outputs-decision-coordination'
import type { OutputsDecisionFailure } from '@/components/study/outputs-decision-failure-modal'
import { countCharactersFromLexical, hasLexicalContent } from '@/lib/lexical'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { buildSharedFiles } from '@/lib/re-wrap-results'
import { Routes } from '@/lib/routes'
import { isStaleDeploymentError } from '@/lib/errors'
import { actionResult } from '@/lib/utils'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { useOutputsReviewFeedbackProvider } from '@/lib/realtime/outputs-review-feedback-provider-context'
import { useDocumentPersistence } from '@/lib/realtime/use-document-persistence'
import { OUTPUTS_DECISION_ERRORS, OUTPUTS_FEEDBACK_MAX_CHARACTERS, type OutputsDecision } from '@/lib/outputs-review'
import type { JobFileInfo } from '@/lib/types'
import type { SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { submitOutputsDecisionAction } from '@/server/actions/study-job.actions'

type UseOutputsDecisionOptions = {
    orgSlug: string
    studyId: string
    jobId: string
    labName: string
    decryptedFiles: JobFileInfo[]
    tabSessionId: string
}

// Only the sharing choice is kept across a reload. Feedback belongs to the collaborative document,
// where writing back a stale local copy would overwrite shared state, and the security key and the
// decrypted outputs must never reach browser storage.
const stashKey = (jobId: string) => `outputs-decision:${jobId}`

const stashDecision = (jobId: string, decision: OutputsDecision | null) => {
    try {
        if (!decision) return
        sessionStorage.setItem(stashKey(jobId), JSON.stringify({ decision, at: new Date().toISOString() }))
    } catch {
        // A reviewer with storage blocked simply re-picks the option after the reload.
    }
}

const clearStashedDecision = (jobId: string) => {
    try {
        sessionStorage.removeItem(stashKey(jobId))
    } catch {
        // Nothing to clean up when storage is unavailable.
    }
}

const readStashedDecision = (jobId: string): OutputsDecision | null => {
    try {
        const raw = sessionStorage.getItem(stashKey(jobId))
        if (!raw) return null
        sessionStorage.removeItem(stashKey(jobId))
        const parsed = JSON.parse(raw) as { decision?: unknown }
        return parsed.decision === 'share-outputs' || parsed.decision === 'share-feedback-only' ? parsed.decision : null
    } catch {
        return null
    }
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
    const { setOwnSubmission, finalizeDecided, checkStatus } = useOutputsDecisionCoordination()
    const provider = useOutputsReviewFeedbackProvider()
    const { awaitFeedbackStored } = useDocumentPersistence(provider, outputsReviewFeedbackDocName(jobId))

    const [feedback, setFeedback] = useState('')
    // Restored after a reload the reviewer was asked to perform, so the one click is not lost.
    const [selected, setSelected] = useState<OutputsDecision | null>(() => readStashedDecision(jobId))
    const [failure, setFailure] = useState<OutputsDecisionFailure | null>(null)
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
        // Yields to the local handler below, which owns copy the card specifies exactly.
        meta: { staleDeploymentHandling: 'local' },
        onMutate: () => setOwnSubmission('pending'),
        onError: async (error) => {
            // Releases the deferral the monitor holds while this tab is submitting, so a decision
            // that landed mid-attempt is applied as soon as the attempt resolves.
            setOwnSubmission('idle')

            // Not reportError: that appends a Sentry reference id to a message the card specifies
            // exactly, and the reviewer cannot act on an action id.
            captureException(error)

            // The request may have committed before its response was lost, or a peer may have won
            // during the attempt. Either way the review is over, so reconcile before blaming it on
            // the submit. Never replay the mutation.
            const status = await checkStatus()
            if (status?.decided) {
                setConfirming(null)
                finalizeDecided(status)
                return
            }

            setConfirming(null)
            const cause = isStaleDeploymentError(error) ? 'stale' : 'retry'
            setFailure({ cause, saved: await awaitFeedbackStored() })
        },
        onSuccess: (result) => {
            setOwnSubmission('succeeded')
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            setConfirming(null)
            clearStashedDecision(jobId)

            // Tells the other tabs at once. They still confirm finality against the database, so a
            // failure here costs latency and never correctness, which is why it cannot throw.
            try {
                const clerkUserId = user?.id
                if (provider && clerkUserId) {
                    const event: SubmissionEvent = {
                        type: 'outputs-review-submitted',
                        studyId,
                        studyJobId: jobId,
                        submittedByTabId: tabSessionId,
                        submittedByClerkId: clerkUserId,
                        submittedByName: result.submitterFullName,
                    }
                    provider.sendStateless(JSON.stringify(event))
                }
            } catch (error) {
                captureException(error)
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

    const onSelect = useCallback((next: OutputsDecision) => setSelected(next), [])

    const confirmSubmit = useCallback(() => {
        if (confirming) submit(confirming)
    }, [confirming, submit])

    const dismissFailure = useCallback(() => setFailure(null), [])

    // Re-checked at click time because the reviewer may have typed while the modal was open. A
    // reload that cannot confirm the feedback says so instead of going ahead silently.
    const reloadForUpdate = useCallback(async () => {
        const saved = await awaitFeedbackStored()
        if (saved === false) {
            setFailure({ cause: 'stale', saved: false })
            return
        }
        stashDecision(jobId, selected)
        window.location.reload()
    }, [awaitFeedbackStored, jobId, selected])

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
        failure,
        dismissFailure,
        reloadForUpdate,
    }
}
