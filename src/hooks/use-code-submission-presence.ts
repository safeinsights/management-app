'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAuth, useUser } from '@clerk/nextjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Doc } from 'yjs'

import { codeSubmissionDocName } from '@/lib/collaboration-documents'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { pickCursorColor } from '@/components/editable-text/config'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'

export type CodeSubmissionPresence = ReturnType<typeof useCodeSubmissionPresence>

// The lab's code pages have no collaborative text, so this opens a content-less Yjs room purely for
// "Also editing" awareness (OTTER-753).
export function useCodeSubmissionPresence(studyId: string, enabled = true) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const socket = useYjsWebsocket()
    const { getToken } = useAuth()
    const { user } = useUser()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
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

    // Here rather than beside a badge, so the kick-out never depends on a badge being rendered.
    useSubmissionRedirectListener({ orgSlug, studyId, types: ['code-submitted'], enabled })

    // Stable identity: the resubmit context folds this into its memoized value.
    return useMemo(() => ({ provider }), [provider])
}
