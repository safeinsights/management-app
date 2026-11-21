'use client'

import { type FC, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { captureException } from '@sentry/nextjs'
import { useMutation } from '@/common'
import { queryKeys } from '@/lib/query-keys'
import { isPermissionDenied } from '@/lib/errors'
import { markStudyOpenedAction } from '@/server/actions/study.actions'

type Stamp = { studyId: string; isEnter: boolean }

// Stamped on leaving too, so a change made during the visit never marks the study unread (OTTER-838).
// The server stamps when the write arrives, so it is never retried or held offline: a late stamp
// would hide changes made after the person left, while a lost one only leaves a dot.
function useMarkStudyOpened(studyId: string | undefined) {
    const { mutate } = useMutation({
        mutationFn: ({ studyId: id }: Stamp) => markStudyOpenedAction({ studyId: id }),
        // The dashboard refetches on mount and can read the rows before the leave stamp lands. Only
        // entering refetches the nav: a dashboard reached on leaving patches its own dot.
        invalidates: ({ isEnter }) => [queryKeys.studyTables(), ...(isEnter ? [queryKeys.navUnreadAll()] : [])],
        // A stamp that keeps failing leaves every dot lit, and the reader cannot act on it. A refusal
        // is a study the user cannot see, which the page already answers with "Study was not found".
        onError: (error) => {
            if (!isPermissionDenied(error)) captureException(error)
        },
        networkMode: 'always',
    })
    const markedOnEnter = useRef<string | null>(null)

    useEffect(() => {
        if (!studyId) return
        // The ref stops StrictMode's remount from writing the enter stamp twice.
        if (markedOnEnter.current !== studyId) {
            markedOnEnter.current = studyId
            mutate({ studyId, isEnter: true })
        }
        return () => mutate({ studyId, isEnter: false })
    }, [studyId, mutate])
}

// Renders nothing. A client leaf, because a write during the server render would also fire on prefetch.
// Mounted in the app shell: the leave stamp is posted from the page the person moves to, and a page
// whose bundle lacks the action drops it.
export const MarkStudyOpened: FC = () => {
    useMarkStudyOpened(useParams<{ studyId?: string }>().studyId)
    return null
}
