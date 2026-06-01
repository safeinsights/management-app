'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import type { Decision } from '@/lib/review-decision'
import { Routes } from '@/lib/routes'
import { type SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { useReviewFeedbackProvider } from '@/lib/realtime/review-feedback-provider-context'
import { submitProposalReviewAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'

export type SubmitReviewArgs = { decision: Decision; feedback: string }

interface UseProposalReviewMutationOptions {
    studyId: string
    orgSlug: string
    /** Per-tab id used to skip the broadcaster's own kick-out broadcast. */
    tabSessionId: string
    /** Current editable review round. The submit action recomputes and validates this. */
    reviewVersion: number
}

export function useProposalReviewMutation({
    studyId,
    orgSlug,
    tabSessionId,
    reviewVersion,
}: UseProposalReviewMutationOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { user } = useUser()
    // Consume the editor's HocuspocusProvider rather than constructing a
    // separate one. The editor's provider has been authenticated since page
    // mount, so the server-side onStateless gate
    // (services/editor/auth.ts -> if (!connectionUserClerkId) return) reliably
    // passes. A private broadcast provider, by contrast, could still be in
    // its onAuthenticate handshake when sendStateless flushes during the
    // WS-open queue drain. Server drops the message silently in that case.
    const editorProvider = useReviewFeedbackProvider()

    const {
        mutate: submitReview,
        isPending,
        isSuccess,
        variables: pendingReview,
    } = useMutation({
        mutationFn: async (args: SubmitReviewArgs) =>
            actionResult(await submitProposalReviewAction({ orgSlug, studyId, reviewVersion, ...args })),
        onError: reportMutationError('Failed to submit review'),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })

            const submittedByClerkId = user?.id
            if (editorProvider && submittedByClerkId) {
                const event: SubmissionEvent = {
                    type: 'proposal-review-submitted',
                    studyId,
                    submittedByTabId: tabSessionId,
                    submittedByClerkId,
                    submittedByName: result.submitterFullName,
                }
                editorProvider.sendStateless(JSON.stringify(event))
            }

            router.push(Routes.studyReview({ orgSlug, studyId }))
        },
    })

    return { submitReview, isPending, isSuccess, pendingReview }
}
