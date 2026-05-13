'use client'

import { useEffect, useState } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { useCodeReviewCollaborationFeatureFlag } from '@/components/openstax-feature-flag'
import { Routes } from '@/lib/routes'
import { codeReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { type SubmissionEvent } from '@/hooks/use-submission-redirect-listener'
import { submitCodeReviewDecisionAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'
import { WS_URL } from '@/lib/config'
import type { CodeReviewCriteria } from '@/hooks/use-code-review-evaluation-map'

export type SubmitCodeReviewArgs = {
    decision: 'approve' | 'reject'
    feedback: string
    criteria: CodeReviewCriteria
}

interface UseCodeReviewMutationOptions {
    studyId: string
    orgSlug: string
    /** Per-tab id used to skip the broadcaster's own kick-out broadcast. */
    tabSessionId: string
}

export function useCodeReviewMutation({ studyId, orgSlug, tabSessionId }: UseCodeReviewMutationOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { getToken } = useAuth()
    const { user } = useUser()
    const isCollaborationEnabled = useCodeReviewCollaborationFeatureFlag()

    // Standalone broadcast provider on its own websocket. Standalone so the broadcast
    // survives the mutation tearing down the editor's shared connection.
    const [broadcastProvider, setBroadcastProvider] = useState<HocuspocusProvider | null>(null)
    useEffect(() => {
        if (!isCollaborationEnabled) return undefined
        const doc = new Y.Doc()
        const docName = codeReviewFeedbackDocName(studyId)
        const provider = new HocuspocusProvider({
            url: WS_URL,
            name: docName,
            document: doc,
            token: async () => (await getToken()) ?? '',
            onAuthenticationFailed: () => {
                console.warn(`broadcast HocuspocusProvider auth failed for ${docName}`)
            },
        } as ConstructorParameters<typeof HocuspocusProvider>[0])
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBroadcastProvider(provider)
        return () => {
            provider.destroy()
            doc.destroy()

            setBroadcastProvider(null)
        }
    }, [isCollaborationEnabled, studyId, getToken])

    const {
        mutate: submitReview,
        isPending,
        isSuccess,
        variables: pendingReview,
    } = useMutation({
        mutationFn: async (args: SubmitCodeReviewArgs) =>
            actionResult(await submitCodeReviewDecisionAction({ orgSlug, studyId, ...args })),
        onError: reportMutationError('Failed to submit code review'),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })

            const submittedByClerkId = user?.id
            if (isCollaborationEnabled && broadcastProvider && submittedByClerkId) {
                const event: SubmissionEvent = {
                    type: 'code-review-submitted',
                    studyId,
                    submittedByTabId: tabSessionId,
                    submittedByClerkId,
                    submittedByName: result.submitterFullName,
                }
                broadcastProvider.sendStateless(JSON.stringify(event))
            }

            router.push(`${Routes.studyReview({ orgSlug, studyId })}?from=code-review`)
        },
    })

    return { submitReview, isPending, isSuccess, pendingReview }
}
