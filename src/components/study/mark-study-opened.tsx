'use client'

import { type FC, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQueryClient } from '@/common'
import { STUDIES_TABLE_QUERY_KEYS } from '@/components/dashboard/studies-table'
import { NAV_UNREAD_QUERY_KEY } from '@/lib/nav/side-nav'
import { markStudyOpenedAction } from '@/server/actions/study.actions'

// Stamped on leaving too, so a change made during the visit never marks the study unread (OTTER-838).
// The server stamps when the write arrives, so it is never retried or held offline: a late stamp
// would hide changes made after the person left, while a lost one only leaves a dot.
function useMarkStudyOpened(studyId: string | undefined) {
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
        networkMode: 'always',
    })
    const markedOnEnter = useRef<string | null>(null)

    useEffect(() => {
        if (!studyId) return
        // The ref stops StrictMode's remount from writing the enter stamp twice.
        if (markedOnEnter.current !== studyId) {
            markedOnEnter.current = studyId
            mutate(studyId)
        }
        return () => mutate(studyId)
    }, [studyId, mutate])
}

// Renders nothing. A client leaf, because a write during the server render would also fire on prefetch.
// Mounted in the app shell: the leave stamp is posted from the page the person moves to, and a page
// whose bundle lacks the action drops it.
export const MarkStudyOpened: FC = () => {
    useMarkStudyOpened(useParams<{ studyId?: string }>().studyId)
    return null
}
