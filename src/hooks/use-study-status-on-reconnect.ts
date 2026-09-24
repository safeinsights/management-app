'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { WebSocketStatus } from '@hocuspocus/provider'

import { Routes } from '@/lib/routes'
import { ActionFailure, isActionError } from '@/lib/errors'
import { reportError, showOrReplaceNotification } from '@/components/errors'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'
import { getStudyStatusAction } from '@/server/actions/editor.actions'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import type { StudyJobStatus, StudyStatus } from '@/database/types'

export type EditableSnapshot = {
    status: StudyStatus
    latestJobStatus: StudyJobStatus | null
    /** Every status row of the job named by `studyJobId`, oldest first; empty when none was named. */
    jobStatuses: readonly StudyJobStatus[]
}

// `id` lets a screen share one notification with its own live-event path, so a race that trips both
// shows a single notice.
export type KickOutNotice = { title: string; message: string; id?: string }

export const STATUS_CHECK_FAILURE_TITLE = 'Failed to check the review status'

const PROPOSAL_SUBMITTED_NOTICE: KickOutNotice = {
    title: 'Submission complete',
    message: 'This proposal has already been submitted. No further edits are allowed at this point.',
}

const REVIEW_DECIDED_NOTICE: KickOutNotice = {
    title: 'Decision submitted',
    message: 'A decision has already been submitted for this review. No further edits are allowed at this point.',
}

// Follows the screen the hook redirects to, so no caller can pick the wording of the other kind of
// round. A screen that shares an id with its own live event still passes its own.
const DEFAULT_NOTICE: Record<Args['redirectTarget'], KickOutNotice> = {
    studySubmitted: PROPOSAL_SUBMITTED_NOTICE,
    studyReview: REVIEW_DECIDED_NOTICE,
    studyReviewCode: REVIEW_DECIDED_NOTICE,
}

// Only a code round needs its own route (REVIEWER_SCREEN_RULES).
const REDIRECT_ROUTE = {
    studySubmitted: Routes.studySubmitted,
    studyReview: Routes.studyReview,
    studyReviewCode: Routes.studyReviewCode,
} satisfies Record<Args['redirectTarget'], unknown>

type Args = {
    studyId: string
    orgSlug: string
    /**
     * The job this screen reviews. Set it when the round is closed by a job status rather than the
     * study status: the newest status row alone can hide a decision, because an asynchronous
     * CODE-SCANNED row may land after FILES-APPROVED on the same job.
     */
    studyJobId?: string
    editableStatuses: readonly string[]
    /** Takes precedence over `editableStatuses`, to gate on latest job status as well. */
    isEditable?: (snapshot: EditableSnapshot) => boolean
    redirectTarget: 'studySubmitted' | 'studyReview' | 'studyReviewCode'
    /** Overrides the default wording for a round that closed without this tab seeing the live event. */
    notice?: KickOutNotice
    enabled?: boolean
}

// A caller that shows its own message for a failed request passes `reportFailure: false`, so the
// reader is not told twice about one failure.
type KickOutOptions = { reportFailure?: boolean }

/** Resolves true when the screen was closed, so a caller can drop its own failure message. */
type KickOutTrigger = (options?: KickOutOptions) => Promise<boolean>

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
    studyJobId,
    orgSlug,
    editableStatuses,
    isEditable,
    redirectTarget,
    notice = DEFAULT_NOTICE[redirectTarget],
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

    const checkStatus = useCallback(
        async ({ reportFailure = true }: KickOutOptions = {}) => {
            // True rather than false: a redirect is already under way, so a caller must not add its own
            // message on top of it.
            if (hasRedirectedRef.current) return true

            // Only the transport throws, which is what happens with no network or with an action id a
            // new build no longer holds; a server-side failure arrives as an envelope. Either way this
            // tab cannot tell whether the round is open, which is not the same answer as "it is", so
            // the failure is reported rather than assumed away (OTTER-726).
            let result: Awaited<ReturnType<typeof getStudyStatusAction>>
            try {
                result = await getStudyStatusAction({ studyId, studyJobId })
            } catch (error) {
                if (reportFailure) reportError(error, STATUS_CHECK_FAILURE_TITLE)
                return false
            }
            if (isActionError(result)) {
                if (reportFailure) reportError(new ActionFailure(result.error), STATUS_CHECK_FAILURE_TITLE)
                return false
            }

            const predicate = isEditableRef.current
            if (predicate) {
                const snapshot: EditableSnapshot = {
                    status: result.status,
                    latestJobStatus: result.latestJobStatus,
                    jobStatuses: result.jobStatuses,
                }
                if (predicate(snapshot)) return false
            } else if (editableStatusesRef.current.includes(result.status)) {
                return false
            }

            hasRedirectedRef.current = true
            showOrReplaceNotification({
                color: 'blue',
                ...noticeRef.current,
                autoClose: NOTIFICATION_DISPLAY_MS,
            })
            router.push(REDIRECT_ROUTE[redirectTargetRef.current]({ orgSlug: orgSlugRef.current, studyId }))
            // An editable screen and the screen that replaces it can answer the same URL, where push
            // alone is a no-op that leaves the closed form mounted.
            router.refresh()
            return true
        },
        [studyId, studyJobId, router],
    )

    // A tab that stayed connected while it was in the background received no event if it had no
    // editor mounted, and no status change either. Asking when the reviewer comes back to it is
    // the moment that matters.
    useEffect(() => {
        if (!enabled) return undefined

        const onVisible = () => {
            if (document.visibilityState === 'visible') void checkStatus()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [enabled, checkStatus])

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
