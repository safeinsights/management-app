'use client'

import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { useCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'

type Props = {
    orgSlug: string
    studyId: string
    /** Per-tab id shared with the broadcasting mutation hook, used to skip self-kick-out. */
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
