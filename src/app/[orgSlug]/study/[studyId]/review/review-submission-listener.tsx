'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { reviewFeedbackDocName } from '@/lib/collaboration-documents'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'

type Props = {
    orgSlug: string
    studyId: string
    /** Per-tab id shared with the broadcasting mutation hook, used to skip self-kick-out. */
    tabSessionId: string
    enabled: boolean
}

/**
 * Listener-only Hocuspocus connection for the DO review-feedback document.
 * Multiplexes over the tab-singleton websocket from `useYjsWebsocket`, so this
 * listener and the editor's own provider share one underlying TCP connection.
 */
export function ReviewSubmissionListener({ orgSlug, studyId, tabSessionId, enabled }: Props) {
    const { getToken } = useAuth()
    const sharedSocket = useYjsWebsocket()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)

    useEffect(() => {
        if (!enabled || !sharedSocket) return undefined

        const doc = new Y.Doc()
        const docName = reviewFeedbackDocName(studyId)
        const next = new HocuspocusProvider({
            websocketProvider: sharedSocket,
            name: docName,
            document: doc,
            token: async () => (await getToken()) ?? '',
            onAuthenticationFailed: () => {
                // Auth failure here means the listener won't subscribe to stateless
                // events; the user falls through to the status poll for kick-out.
                console.warn(`listener HocuspocusProvider auth failed for ${docName}`)
            },
        } as ConstructorParameters<typeof HocuspocusProvider>[0])
        // With a shared websocketProvider the constructor leaves manageSocket=false.
        // Without this attach() the document never registers in providerMap.
        next.attach()
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProvider(next)

        return () => {
            next.destroy()
            doc.destroy()

            setProvider(null)
        }
    }, [enabled, studyId, getToken, sharedSocket])

    useSubmissionRedirectListener({
        provider,
        orgSlug,
        studyId,
        currentTabId: tabSessionId,
        enabled,
    })

    return null
}
