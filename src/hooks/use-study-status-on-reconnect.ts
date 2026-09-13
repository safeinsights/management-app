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
import type { StudyJobStatus, StudyStatus } from '@/database/types'

export type EditableSnapshot = {
    status: StudyStatus
    latestJobStatus: StudyJobStatus | null
}

export type KickOutNotice = { title: string; message: string }

// What a proposal tab is told. Every screen that closes for another reason passes its own.
const PROPOSAL_SUBMITTED_NOTICE: KickOutNotice = {
    title: 'Submission complete',
    message: 'This proposal has already been submitted. No further edits are allowed at this point.',
}

type Args = {
    studyId: string
    orgSlug: string
    editableStatuses: readonly string[]
    /** Takes precedence over `editableStatuses`, to gate on latest job status as well. */
    isEditable?: (snapshot: EditableSnapshot) => boolean
    redirectTarget: 'studySubmitted' | 'studyReview'
    /** This screen's wording for a round that closed without this tab seeing the live event. */
    notice?: KickOutNotice
    enabled?: boolean
}

/** Resolves true when the screen was closed, so a caller can drop its own failure message. */
type KickOutTrigger = () => Promise<boolean>

const KickOutContext = createContext<KickOutTrigger | null>(null)

// For the editor's per-document `STUDY_NOT_EDITABLE` auth failure, which is a separate signal from
// the shared socket's status. A no-op when no kick-out hook is mounted.
export function useTriggerStudyKickOut(): KickOutTrigger {
    const trigger = useContext(KickOutContext)
    return trigger ?? noop
}

const noop: KickOutTrigger = async () => false

// Backstop for the kick-out flow: stateless events are not replayed, so a tab that was disconnected
// or opened cold would miss a peer's submission.
export function useStudyStatusOnReconnect({
    studyId,
    orgSlug,
    editableStatuses,
    isEditable,
    redirectTarget,
    notice = PROPOSAL_SUBMITTED_NOTICE,
    enabled = true,
}: Args) {
    const router = useRouter()
    const socket = useYjsWebsocket()
    const hasRedirectedRef = useRef(false)
    // A latch, because `connected` can re-emit without a real disconnect in between.
    const wasDisconnectedRef = useRef(true)

    // Refs so inline arrays/objects from callers don't re-run the effect on every render.
    const editableStatusesRef = useRef(editableStatuses)
    const isEditableRef = useRef(isEditable)
    const orgSlugRef = useRef(orgSlug)
    const redirectTargetRef = useRef(redirectTarget)
    const noticeRef = useRef(notice)
    useEffect(() => {
        editableStatusesRef.current = editableStatuses
        isEditableRef.current = isEditable
        orgSlugRef.current = orgSlug
        redirectTargetRef.current = redirectTarget
        noticeRef.current = notice
    }, [editableStatuses, isEditable, orgSlug, redirectTarget, notice])

    const checkStatus = useCallback(async () => {
        // True rather than false: a redirect is already under way, so a caller must not add its own
        // message on top of it.
        if (hasRedirectedRef.current) return true
        const result = await getStudyStatusAction({ studyId })
        if (isActionError(result)) return false
        const predicate = isEditableRef.current
        if (predicate) {
            if (predicate({ status: result.status, latestJobStatus: result.latestJobStatus })) return false
        } else if (editableStatusesRef.current.includes(result.status)) {
            return false
        }

        hasRedirectedRef.current = true
        notifications.show({
            color: 'blue',
            ...noticeRef.current,
            autoClose: NOTIFICATION_DISPLAY_MS,
        })
        if (redirectTargetRef.current === 'studySubmitted') {
            router.push(Routes.studySubmitted({ orgSlug: orgSlugRef.current, studyId }))
        } else {
            router.push(Routes.studyReview({ orgSlug: orgSlugRef.current, studyId }))
        }
        // An editable screen and the screen that replaces it can answer the same URL, where push
        // alone is a no-op that leaves the closed form mounted.
        router.refresh()
        return true
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
        // Already-connected on mount is common on warm navigation between proposal/review pages.
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

export function StudyKickOutProvider({ children, ...args }: ProviderProps) {
    const { triggerKickOut } = useStudyStatusOnReconnect(args)
    return createElement(KickOutContext.Provider, { value: triggerKickOut }, children)
}
