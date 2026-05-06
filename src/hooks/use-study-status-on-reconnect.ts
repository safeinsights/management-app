'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { WebSocketStatus } from '@hocuspocus/provider'

import { Routes } from '@/lib/routes'
import { isActionError } from '@/lib/errors'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'
import { getStudyStatusAction } from '@/server/actions/editor.actions'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'

type Args = {
    studyId: string
    orgSlug: string
    /** Statuses where editing is still allowed. Mismatch triggers redirect. */
    editableStatuses: readonly string[]
    /** Where to send the user when status no longer matches. */
    redirectTarget: 'studySubmitted' | 'studyReview'
    enabled?: boolean
}

/** Imperative trigger exposed via context so the editor can request a kick-out check. */
type KickOutTrigger = () => void

const KickOutContext = createContext<KickOutTrigger | null>(null)

/**
 * Returns a stable function that, when called, triggers the same kick-out check
 * as a websocket reconnect. The editor calls this when it observes a server
 * `STUDY_NOT_EDITABLE` auth failure on a per-document handshake — that path is
 * a separate signal from the shared websocket's status, so it needs its own
 * trigger to drive the redirect.
 *
 * Returns a no-op when there is no kick-out hook mounted in the tree (the
 * collaboration feature flag is off, or the editor renders outside the proposal
 * / review pages).
 */
export function useTriggerStudyKickOut(): KickOutTrigger {
    const trigger = useContext(KickOutContext)
    return trigger ?? noop
}

const noop: KickOutTrigger = () => {}

/**
 * Backstop for the multi-user kick-out flow.
 *
 * The primary path is the Hocuspocus stateless event (see useSubmissionRedirectListener),
 * but stateless events are fire-and-forget and not replayed on reconnect. This hook fires
 * one HTTP status check whenever the shared websocket transitions back into Connected,
 * which catches the two scenarios the stateless path can't:
 *
 *   1. Tab that was disconnected when a peer submitted — reconnect re-auth would already
 *      throw `STUDY_NOT_EDITABLE`, but we keep this hook as a defence-in-depth check that
 *      fires even if the auth handshake somehow succeeds (e.g. brief race during the
 *      status flip on the server).
 *   2. Tab opened cold against a study a peer has already submitted, where the broadcast
 *      happened before our listener attached.
 *
 * Crucially this is NOT a poll: zero requests on a stable connection. One request per
 * reconnect cycle, plus one on initial connect, plus on-demand when the editor surfaces
 * a STUDY_NOT_EDITABLE auth failure.
 */
export function useStudyStatusOnReconnect({
    studyId,
    orgSlug,
    editableStatuses,
    redirectTarget,
    enabled = true,
}: Args) {
    const router = useRouter()
    const socket = useYjsWebsocket()
    const hasRedirectedRef = useRef(false)
    // Track whether the next 'connected' event should trigger a status check.
    // True on the first connect after mount; thereafter only true after the socket
    // dropped at least once. Without this latch we'd fire on every status churn
    // even though `connected` can re-emit without a real disconnect in between.
    const wasDisconnectedRef = useRef(true)

    // Stable refs guard against re-running the effect when callers pass inline
    // arrays / objects on each render. The contract is just "check once on each
    // connect transition" and that doesn't depend on identity churn.
    const editableStatusesRef = useRef(editableStatuses)
    const orgSlugRef = useRef(orgSlug)
    const redirectTargetRef = useRef(redirectTarget)
    useEffect(() => {
        editableStatusesRef.current = editableStatuses
        orgSlugRef.current = orgSlug
        redirectTargetRef.current = redirectTarget
    }, [editableStatuses, orgSlug, redirectTarget])

    const checkStatus = useCallback(async () => {
        if (hasRedirectedRef.current) return
        const result = await getStudyStatusAction({ studyId })
        if (isActionError(result)) return
        if (editableStatusesRef.current.includes(result.status)) return

        hasRedirectedRef.current = true
        notifications.show({
            color: 'blue',
            title: 'Submission complete',
            message: 'This proposal has already been submitted. No further edits are allowed at this point.',
            autoClose: NOTIFICATION_DISPLAY_MS,
        })
        if (redirectTargetRef.current === 'studySubmitted') {
            router.push(Routes.studySubmitted({ orgSlug: orgSlugRef.current, studyId }))
        } else {
            router.push(Routes.studyReview({ orgSlug: orgSlugRef.current, studyId }))
        }
    }, [studyId, router])

    useEffect(() => {
        if (!enabled || !socket) return undefined

        const onStatus = ({ status }: { status: WebSocketStatus }) => {
            if (status !== WebSocketStatus.Connected) {
                wasDisconnectedRef.current = true
                return
            }
            if (!wasDisconnectedRef.current) return
            wasDisconnectedRef.current = false
            void checkStatus()
        }

        socket.on('status', onStatus)
        // If the socket is already connected when we mount (common on warm navigation
        // between proposal/review pages), fire one immediate check.
        if (socket.status === WebSocketStatus.Connected) {
            wasDisconnectedRef.current = false
            void checkStatus()
        }

        return () => {
            socket.off('status', onStatus)
        }
    }, [enabled, socket, checkStatus])

    return { triggerKickOut: checkStatus }
}

type ProviderProps = Args & { children: ReactNode }

/**
 * Wraps children with a kick-out context so descendant editors can call
 * `useTriggerStudyKickOut()` to request the check imperatively. Combines the
 * hook + provider in one place to keep call sites tidy.
 */
export function StudyKickOutProvider({ children, ...args }: ProviderProps) {
    const { triggerKickOut } = useStudyStatusOnReconnect(args)
    return createElement(KickOutContext.Provider, { value: triggerKickOut }, children)
}
