'use client'

import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'

type Props = {
    orgSlug: string
    studyId: string
    jobId: string
    enabled: boolean
}

export function CodeReviewSubmissionListener({ orgSlug, studyId, jobId, enabled }: Props) {
    useSubmissionRedirectListener({ orgSlug, studyId, types: ['code-review-submitted'], jobId, enabled })
    return null
}
