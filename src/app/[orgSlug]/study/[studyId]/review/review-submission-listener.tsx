'use client'

import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { useReviewFeedbackProvider } from '@/lib/realtime/review-feedback-provider-context'

type Props = {
    orgSlug: string
    studyId: string
    // Shared with the broadcasting mutation hook so a tab can skip its own kick-out.
    tabSessionId: string
    enabled: boolean
}

// Subscribes to the same HocuspocusProvider the Lexical editor uses: two providers sharing a name
// collide in providerMap and the second attach() wins, leaving the loser deaf.
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
