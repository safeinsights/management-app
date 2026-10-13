'use client'

import { type FC, useEffect, useRef } from 'react'
import { captureException } from '@sentry/nextjs'
import { useMutation, useQueryClient } from '@/common'
import { STUDIES_TABLE_QUERY_KEYS } from '@/components/dashboard/studies-table'
import { NAV_UNREAD_QUERY_KEY } from '@/lib/nav/side-nav'
import { markStudyOpenedAction } from '@/server/actions/study.actions'

// Stamped on leaving too, so a change made during the visit (often the viewer's own) never marks
// the study unread (OTTER-838). Failures go to Sentry only: the reader cannot act on them.
function useMarkStudyOpened(studyId: string) {
    const queryClient = useQueryClient()
    const { mutate } = useMutation({
        mutationFn: (id: string) => markStudyOpenedAction({ studyId: id }),
        // The dashboard refetches on mount and can read the rows before the leave stamp lands.
        onSuccess: async () => {
            await Promise.all(
                [...STUDIES_TABLE_QUERY_KEYS.map((key) => [key]), NAV_UNREAD_QUERY_KEY].map((queryKey) =>
                    queryClient.invalidateQueries({ queryKey }),
                ),
            )
        },
        retry: 2,
        onError: (error) => captureException(error),
    })
    const markedOnEnter = useRef<string | null>(null)

    useEffect(() => {
        // The ref stops StrictMode's remount from writing the enter stamp twice.
        if (markedOnEnter.current !== studyId) {
            markedOnEnter.current = studyId
            mutate(studyId)
        }
        return () => mutate(studyId)
    }, [studyId, mutate])
}

// Renders nothing. A client leaf, because a write during the server render would also fire on prefetch.
export const MarkStudyOpened: FC<{ studyId: string }> = ({ studyId }) => {
    useMarkStudyOpened(studyId)
    return null
}
