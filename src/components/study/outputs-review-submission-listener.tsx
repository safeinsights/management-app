'use client'

import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'

type Props = {
    orgSlug: string
    studyId: string
    jobId: string
    enabled: boolean
}

export function OutputsReviewSubmissionListener({ orgSlug, studyId, jobId, enabled }: Props) {
    useSubmissionRedirectListener({ orgSlug, studyId, types: ['outputs-review-submitted'], jobId, enabled })
    return null
}
