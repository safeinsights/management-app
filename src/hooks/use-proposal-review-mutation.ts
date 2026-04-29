'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { useProposalCollaborationFeatureFlag } from '@/components/openstax-feature-flag'
import type { Decision } from '@/lib/proposal-review'
import { Routes } from '@/lib/routes'
import { reviewFeedbackDocName } from '@/lib/collaboration-documents'
import { type SubmissionEvent, SUBMISSION_SENTINEL_KEY } from '@/hooks/use-submission-redirect-listener'
import { submitProposalReviewAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'
import { WS_URL } from '@/server/config'

export type SubmitReviewArgs = { decision: Decision; feedback: string }

interface UseProposalReviewMutationOptions {
    studyId: string
    orgSlug: string
    /** Per-tab id used to skip the broadcaster's own kick-out broadcast. */
    tabSessionId: string
}

export function useProposalReviewMutation({ studyId, orgSlug, tabSessionId }: UseProposalReviewMutationOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { getToken } = useAuth()
    const isCollaborationEnabled = useProposalCollaborationFeatureFlag()

    const [broadcastProvider, setBroadcastProvider] = useState<HocuspocusProvider | null>(null)
    useEffect(() => {
        if (!isCollaborationEnabled) return undefined
        const doc = new Y.Doc()
        const docName = reviewFeedbackDocName(studyId)
        const provider = new HocuspocusProvider({
            url: WS_URL,
            name: docName,
            document: doc,
            token: async () => (await getToken()) ?? '',
            onAuthenticationFailed: () => {
                // Auth failures here mean the broadcast event won't go out;
                // listeners fall through to Layer 2 (Y.Map sentinel via the editor's
                // own provider) and Layer 3 (status poll). Acceptable degradation.
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
        mutationFn: async (args: SubmitReviewArgs) =>
            actionResult(await submitProposalReviewAction({ orgSlug, studyId, ...args })),
        onError: reportMutationError('Failed to submit review'),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })

            if (isCollaborationEnabled && broadcastProvider) {
                const event: SubmissionEvent = {
                    type: 'proposal-review-submitted',
                    studyId,
                    submittedByTabId: tabSessionId,
                    submittedByName: result.submitterFullName,
                }
                broadcastProvider.sendStateless(JSON.stringify(event))
                const map = broadcastProvider.document.getMap(SUBMISSION_SENTINEL_KEY)
                broadcastProvider.document.transact(() => map.set(SUBMISSION_SENTINEL_KEY, event))
            }

            router.push(Routes.studyReview({ orgSlug, studyId }))
        },
    })

    return { submitReview, isPending, isSuccess, pendingReview }
}
