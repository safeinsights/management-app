'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Doc } from 'yjs'

import { codeSubmissionDocName } from '@/lib/collaboration-documents'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { pickCursorColor } from '@/components/editable-text/config'
import type { SubmissionEvent } from '@/hooks/use-submission-redirect-listener'

export type CodeSubmissionPresence = ReturnType<typeof useCodeSubmissionPresence>

// The lab's code pages have no collaborative text, so this opens a content-less Yjs room purely for
// "Also editing" awareness and the kick-out event the other rounds already send (OTTER-753).
export function useCodeSubmissionPresence(studyId: string, enabled = true) {
    const socket = useYjsWebsocket()
    const { getToken } = useAuth()
    const { user } = useUser()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
    const [tabSessionId] = useState(() => crypto.randomUUID())
    const userId = user?.id
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Anonymous'

    useEffect(() => {
        if (!enabled || !socket) return undefined
        const next = new HocuspocusProvider({
            websocketProvider: socket,
            name: codeSubmissionDocName(studyId),
            document: new Doc(),
            token: async () => (await getToken()) ?? '',
        })
        // A shared socket leaves manageSocket=false, so nothing attaches the room for us.
        next.attach()
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProvider(next)
        return () => {
            next.destroy()
            setProvider(null)
        }
    }, [enabled, socket, studyId, getToken])

    // Same awareness shape Lexical's CollaborationPlugin writes, so useActiveEditors reads both.
    useEffect(() => {
        if (!provider || !userId) return
        provider.awareness?.setLocalState({
            name,
            color: pickCursorColor(name),
            focusing: false,
            awarenessData: { userId },
        })
    }, [provider, userId, name])

    const broadcastSubmitted = useCallback(() => {
        if (!provider || !userId) return
        const event: SubmissionEvent = {
            type: 'code-submitted',
            studyId,
            submittedByTabId: tabSessionId,
            submittedByClerkId: userId,
            submittedByName: name,
        }
        provider.sendStateless(JSON.stringify(event))
    }, [provider, userId, name, studyId, tabSessionId])

    // Stable identity: the resubmit context folds this into its memoised value.
    return useMemo(() => ({ provider, tabSessionId, broadcastSubmitted }), [provider, tabSessionId, broadcastSubmitted])
}
