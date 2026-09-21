'use client'

import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { useCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'

type Props = {
    orgSlug: string
    studyId: string
    // Shared with the broadcasting mutation hook so a tab can skip its own kick-out.
    tabSessionId: string
    enabled: boolean
}

export function CodeReviewSubmissionListener({ orgSlug, studyId, tabSessionId, enabled }: Props) {
    const provider = useCodeReviewFeedbackProvider()

    useSubmissionRedirectListener({
        provider,
        orgSlug,
        studyId,
        currentTabId: tabSessionId,
        enabled,
    })

    return null
}
