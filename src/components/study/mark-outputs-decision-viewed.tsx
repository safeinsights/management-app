'use client'

import { type FC, useEffect, useRef } from 'react'
import { captureException } from '@sentry/nextjs'
import { useMutation, useQueryClient } from '@/common'
import { RESEARCHER_STUDIES_QUERY_KEYS } from '@/components/dashboard/studies-table'
import { actionResult } from '@/lib/utils'
import { markOutputsDecisionViewedAction } from '@/server/actions/study-job.actions'

// Failures go to Sentry only: the reader cannot act on them. The ref stops StrictMode writing twice.
function useMarkOutputsDecisionViewed(studyId: string) {
    const queryClient = useQueryClient()
    const { mutate } = useMutation({
        mutationFn: async () => actionResult(await markOutputsDecisionViewedAction({ studyId })),
        // Dashboard rows keep for a minute and never refetch on focus, so leaving by the in-app link
        // would land on the badge this write just superseded.
        onSuccess: async () => {
            await Promise.all(
                Object.values(RESEARCHER_STUDIES_QUERY_KEYS).map((key) =>
                    queryClient.invalidateQueries({ queryKey: [key] }),
                ),
            )
        },
        // Nothing else asks again: the reader is already past the decision, and the guard below stops
        // this leaf retrying on its own.
        retry: 2,
        onError: (error) => captureException(error),
    })
    const hasMarked = useRef(false)

    useEffect(() => {
        if (hasMarked.current) return

        hasMarked.current = true
        mutate()
    }, [mutate])
}

// Renders nothing. A client leaf, because a write during the server render would also fire on prefetch.
export const MarkOutputsDecisionViewed: FC<{ studyId: string }> = ({ studyId }) => {
    useMarkOutputsDecisionViewed(studyId)
    return null
}
