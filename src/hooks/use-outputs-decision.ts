'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { DECISION_GROUP_ID, FEEDBACK_INPUT_ID } from '@/components/study/outputs-decision-section'
import { useProviderSaveStatus } from '@/lib/realtime/use-provider-save-status'
import { countWordsFromLexical } from '@/lib/lexical'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { buildSharedFiles } from '@/lib/re-wrap-results'
import { Routes } from '@/lib/routes'
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
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
    // Errors surface only after the user has left a field or pressed Submit; a pristine form
    // must not open with everything flagged red.
    const [showFeedbackError, setShowFeedbackError] = useState(false)
    const [showDecisionError, setShowDecisionError] = useState(false)
    const [isOpen, setIsOpen] = useState(false)

    const saveStatus = useProviderSaveStatus(provider)
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
                    jobInfo: { studyId, studyJobId: jobId, orgSlug },
                    decision,
                    feedback,
                    maxWords,
                    sharedFiles,
                }),
            )
        },
        onError: reportMutationError('Failed to submit your decision'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            setIsOpen(false)
            // The decision is recorded, so bare /review re-resolves through the reviewer state
            // machine to the post-decision screen.
            router.push(Routes.studyReview({ orgSlug, studyId }))
        },
    })

    // Flags every problem at once rather than stopping at the first: the user should see the
    // full set on one click, even though focus can only land on one of them.
    const attemptSubmit = useCallback(() => {
        setShowFeedbackError(true)
        setShowDecisionError(true)

        const invalid: Record<string, boolean> = {
            [FEEDBACK_INPUT_ID]: isEmpty || isOverLimit,
            [DECISION_GROUP_ID]: selected === null,
        }

        if (FIELD_ORDER.some((fieldId) => invalid[fieldId])) {
            focusFirstInvalid(FIELD_ORDER, (fieldId) => invalid[fieldId])
            return
        }

        setIsOpen(true)
    }, [isEmpty, isOverLimit, selected])

    const onSelect = useCallback((next: OutputsDecision) => {
        setSelected(next)
        setShowDecisionError(false)
    }, [])

    const confirmSubmit = useCallback(() => {
        if (selected === null) return
        submit(selected)
    }, [selected, submit])

    return {
        feedback,
        onFeedbackChange: setFeedback,
        onFeedbackBlur: () => setShowFeedbackError(true),
        onProviderReady: setProvider,
        feedbackError,
        wordCount,
        saveStatus,
        selected,
        onSelect,
        onDecisionBlur: () => setShowDecisionError(true),
        decisionError,
        isModalOpen: isOpen,
        closeModal: () => setIsOpen(false),
        attemptSubmit,
        confirmSubmit,
        isSubmitting: isPending,
    }
}
