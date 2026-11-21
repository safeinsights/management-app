'use client'

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Doc } from 'yjs'

import { useQueryClient } from '@/common'
import { parseStudyEvent, studyEventsDocName, type StudyEvent } from '@/lib/collaboration-documents'
import { queryKeys } from '@/lib/query-keys'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'

type StudyEventListener = (event: StudyEvent) => void

type StudyEvents = {
    /** One id per tab, stable across navigation within the study, sent as an action's originTabId. */
    tabId: string
    subscribe: (listener: StudyEventListener) => () => void
}

// For a component rendered without the study layout, such as a unit test of one screen.
const StudyEventsContext = createContext<StudyEvents>({
    tabId: crypto.randomUUID(),
    subscribe: () => () => {},
})

export const useStudyEvents = () => useContext(StudyEventsContext)

function useStudyEventsChannel(studyId: string): StudyEvents {
    const socket = useYjsWebsocket()
    const { getToken } = useAuth()
    const queryClient = useQueryClient()
    const router = useRouter()
    const [tabId] = useState(() => crypto.randomUUID())
    const listeners = useRef(new Set<StudyEventListener>())

    // Through a ref because Clerk hands back a fresh `getToken` identity on most renders, and a
    // rebuilt provider per render leaks a Y.Doc each time.
    const getTokenRef = useRef(getToken)
    useEffect(() => {
        getTokenRef.current = getToken
    }, [getToken])

    const refresh = (jobKey: readonly unknown[] | null) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.study(studyId) })
        if (jobKey) queryClient.invalidateQueries({ queryKey: jobKey })
        router.refresh()
    }

    // Events can be missed while the room is not synced, and nothing says which job they named.
    const recover = useEffectEvent(() => refresh(queryKeys.jobAll()))

    const onEvent = useEffectEvent((event: StudyEvent) => {
        if (event.studyId !== studyId) return
        if (event.change === 'resync') recover()
        // This tab's own mutation and action response already refreshed it.
        else if (event.originTabId !== tabId) refresh(event.jobId ? queryKeys.job(event.jobId) : null)
        listeners.current.forEach((listener) => listener(event))
    })

    useEffect(() => {
        if (!socket) return undefined
        const provider = new HocuspocusProvider({
            websocketProvider: socket,
            name: studyEventsDocName(studyId),
            document: new Doc(),
            token: async () => (await getTokenRef.current()) ?? '',
            // An editor that predates this channel refuses it; the page then works as it did before.
            onAuthenticationFailed: () => console.warn(`study events channel refused for study ${studyId}`),
        })
        const onStateless = ({ payload }: { payload: unknown }) => {
            const event = parseStudyEvent(payload)
            if (event) onEvent(event)
        }
        // Fires at the first handshake and after each reconnect, which covers both the gap before
        // the subscription and anything missed while disconnected.
        const onSynced = () => recover()
        provider.on('stateless', onStateless)
        provider.on('synced', onSynced)
        // A shared socket leaves manageSocket=false, so nothing attaches the room for us.
        provider.attach()
        return () => {
            provider.off('stateless', onStateless)
            provider.off('synced', onSynced)
            provider.destroy()
        }
    }, [socket, studyId])

    const subscribe = useCallback((listener: StudyEventListener) => {
        listeners.current.add(listener)
        return () => {
            listeners.current.delete(listener)
        }
    }, [])

    return useMemo(() => ({ tabId, subscribe }), [tabId, subscribe])
}

// One per study page, in the study layout, so it stays connected across in-study navigation.
export function StudyEventsProvider({ studyId, children }: { studyId: string; children: ReactNode }) {
    const value = useStudyEventsChannel(studyId)
    return <StudyEventsContext.Provider value={value}>{children}</StudyEventsContext.Provider>
}
