'use client'

import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { useOutputsReviewFeedbackProvider } from '@/lib/realtime/outputs-review-feedback-provider-context'

type Props = {
    orgSlug: string
    studyId: string
    /** Shared with the broadcasting decision hook so a tab can skip its own kick-out. */
    tabSessionId: string
    enabled: boolean
}

// Mirror of CodeReviewSubmissionListener for the outputs round. The provider exists only once the
// feedback editor has mounted, so a reviewer who has not entered their security key is closed out
// by the status backstop instead.
export function OutputsReviewSubmissionListener({ orgSlug, studyId, tabSessionId, enabled }: Props) {
    const provider = useOutputsReviewFeedbackProvider()

    useSubmissionRedirectListener({
        provider,
        orgSlug,
        studyId,
        currentTabId: tabSessionId,
        enabled,
    })

    return null
}
