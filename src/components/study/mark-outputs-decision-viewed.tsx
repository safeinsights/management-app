'use client'

import { type FC, useEffect, useRef } from 'react'
import { captureException } from '@sentry/nextjs'
import { useMutation } from '@/common'
import { useStudyEvents } from '@/hooks/use-study-events'
import { queryKeys } from '@/lib/query-keys'
import { actionResult } from '@/lib/utils'
import { markOutputsDecisionViewedAction } from '@/server/actions/study-job.actions'

// Failures go to Sentry only: the reader cannot act on them.
export function useMarkOutputsDecisionViewed(studyId: string) {
    const { tabId } = useStudyEvents()
    const { mutate } = useMutation({
        // With the tab id, so decrypting does not refresh the page the reader is looking at.
        mutationFn: async (decrypted: boolean) =>
            actionResult(await markOutputsDecisionViewedAction({ studyId, decrypted, originTabId: tabId })),
        // Dashboard rows keep for a minute and never refetch on focus, so leaving by the in-app link
        // would land on the badge this write just superseded.
        invalidates: () => [queryKeys.researcherOrgStudiesAll(), queryKeys.researcherUserStudies()],
        // Nothing else asks again: the reader is already past the decision, and the callers fire once.
        retry: 2,
        onError: (error) => captureException(error),
    })
    return mutate
}

// The ref stops StrictMode writing twice.
function useMarkViewedOnMount(studyId: string) {
    const markViewed = useMarkOutputsDecisionViewed(studyId)
    const hasMarked = useRef(false)

    useEffect(() => {
        if (hasMarked.current) return

        hasMarked.current = true
        markViewed(false)
    }, [markViewed])
}

// Renders nothing. A client leaf, because a write during the server render would also fire on prefetch.
export const MarkOutputsDecisionViewed: FC<{ studyId: string }> = ({ studyId }) => {
    useMarkViewedOnMount(studyId)
    return null
}
