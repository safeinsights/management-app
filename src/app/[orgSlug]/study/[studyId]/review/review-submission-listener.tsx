'use client'

import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { useReviewFeedbackProvider } from '@/lib/realtime/review-feedback-provider-context'

type Props = {
    orgSlug: string
    studyId: string
    /** Per-tab id shared with the broadcasting mutation hook, used to skip self-kick-out. */
    tabSessionId: string
    enabled: boolean
}

/**
 * Listener for the DO review-feedback document's stateless events.
 *
 * Subscribes to the SAME HocuspocusProvider the Lexical editor uses for
 * `review-feedback-${studyId}` rather than creating its own. Two providers
 * attached to the shared websocket with the same name collide in
 * `HocuspocusProviderWebsocket.providerMap` (Map keyed by name) — the second
 * `attach()` overwrites the first and the loser goes deaf. By multiplexing
 * the editor and the listener over a single provider, the stateless event
 * is delivered reliably regardless of mount order.
 */
export function ReviewSubmissionListener({ orgSlug, studyId, tabSessionId, enabled }: Props) {
    const provider = useReviewFeedbackProvider()

    useSubmissionRedirectListener({
        provider,
        orgSlug,
        studyId,
        currentTabId: tabSessionId,
        enabled,
    })

    return null
}
