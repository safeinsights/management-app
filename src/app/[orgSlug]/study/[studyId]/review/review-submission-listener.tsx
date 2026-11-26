'use client'

import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'

type Props = {
    orgSlug: string
    studyId: string
    enabled: boolean
}

export function ReviewSubmissionListener({ orgSlug, studyId, enabled }: Props) {
    useSubmissionRedirectListener({ orgSlug, studyId, types: ['proposal-review-submitted'], enabled })
    return null
}
