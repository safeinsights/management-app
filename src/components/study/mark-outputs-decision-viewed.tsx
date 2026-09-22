'use client'

import { type FC, useEffect, useRef } from 'react'
import { captureException } from '@sentry/nextjs'
import { useMutation, useQueryClient } from '@/common'
import { actionResult } from '@/lib/utils'
import { markOutputsDecisionViewedAction } from '@/server/actions/study-job.actions'

// The two tables that draw a researcher badge. Both hold rows this write has just made wrong.
const RESEARCHER_STUDY_QUERY_KEYS = [['user-researcher-studies'], ['researcher-studies']]

/**
 * Records that the research lab has now seen the released outputs decision, so their badge can move
 * on from "Outputs need review". A failure is not surfaced: the badge is a courtesy on the lab's own
 * dashboard, so a toast would report a problem the reader did not cause and cannot act on. The ref
 * keeps a re-render, or StrictMode's double mount, from writing a second audit row.
 */
function useMarkOutputsDecisionViewed(studyId: string) {
    const queryClient = useQueryClient()
    const { mutate } = useMutation({
        mutationFn: async () => actionResult(await markOutputsDecisionViewedAction({ studyId })),
        // Dashboard rows keep for a minute and never refetch on focus, so leaving by the in-app link
        // would land on the badge this write just superseded.
        onSuccess: async () => {
            await Promise.all(
                RESEARCHER_STUDY_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
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

// Renders nothing. The researcher outputs screens are async server components, so recording the
// view from the client needs a leaf that mounts with them rather than a write during their render,
// which would also fire on link prefetch.
export const MarkOutputsDecisionViewed: FC<{ studyId: string }> = ({ studyId }) => {
    useMarkOutputsDecisionViewed(studyId)
    return null
}
