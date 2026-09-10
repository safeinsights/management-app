'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { WebSocketStatus } from '@hocuspocus/provider'
import { captureException } from '@sentry/nextjs'

import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { useOutputsReviewFeedbackProvider } from '@/lib/realtime/outputs-review-feedback-provider-context'
import { tryDecodeStateless } from '@/hooks/use-submission-redirect-listener'
import type { OutputsDecisionStatus } from '@/lib/outputs-review'
import { getOutputsDecisionStatusAction } from '@/server/actions/study-job.actions'

// A peer's stateless event redirects the other tabs immediately, but an event is not replayed, so a
// tab that slept, that never mounted the editor, or that lost its own response has to find out by
// asking. This interval is the backstop for those, not the primary path.
export const OUTPUTS_DECISION_POLL_MS = 30_000

export const peerDecisionMessage = (decidedByName: string) =>
    `${decidedByName} has proceeded to submit a decision on this output. No further edits are allowed at this point.`

export type OwnSubmission = 'idle' | 'pending' | 'succeeded'

type Args = {
    orgSlug: string
    studyId: string
    jobId: string
    tabSessionId: string
    enabled: boolean
}

export function useOutputsDecisionMonitor({ orgSlug, studyId, jobId, tabSessionId, enabled }: Args) {
    const router = useRouter()
    const socket = useYjsWebsocket()
    const provider = useOutputsReviewFeedbackProvider()

    const ownSubmissionRef = useRef<OwnSubmission>('idle')
    const hasFinalizedRef = useRef(false)
    const hasReportedErrorRef = useRef(false)
    // Held so a decision seen while this tab's own submit was in flight is not lost: the attempt's
    // own handler finalizes, and this is the value it uses.
    const deferredStatusRef = useRef<OutputsDecisionStatus | null>(null)

    const checkStatus = useCallback(async (): Promise<OutputsDecisionStatus | null> => {
        try {
            return actionResult(await getOutputsDecisionStatusAction({ studyJobId: jobId }))
        } catch (error) {
            // A background poll that fails must not raise a notification the reviewer cannot act on.
            if (!hasReportedErrorRef.current) {
                hasReportedErrorRef.current = true
                captureException(error)
            }
            return null
        }
    }, [jobId])

    const finalizeDecided = useCallback(
        (status: OutputsDecisionStatus) => {
            if (hasFinalizedRef.current) return
            hasFinalizedRef.current = true

            // Suppressed only for the tab whose own submit succeeded. Another tab of the same user
            // is a peer and is told, which is why the check is never on author identity.
            if (ownSubmissionRef.current !== 'succeeded' && status.decidedByName) {
                notifications.show({
                    color: 'blue',
                    title: 'Decision submitted',
                    message: peerDecisionMessage(status.decidedByName),
                    autoClose: NOTIFICATION_DISPLAY_MS,
                })
            }

            // The editable and decided screens share this URL, so push alone would leave the
            // decrypted form mounted.
            router.push(Routes.studyReview({ orgSlug, studyId }))
            router.refresh()
        },
        [orgSlug, router, studyId],
    )

    const setOwnSubmission = useCallback(
        (next: OwnSubmission) => {
            ownSubmissionRef.current = next
            const deferred = deferredStatusRef.current
            if (next === 'idle' && deferred) {
                deferredStatusRef.current = null
                finalizeDecided(deferred)
            }
        },
        [finalizeDecided],
    )

    const applyStatus = useCallback(
        (status: OutputsDecisionStatus | null) => {
            if (!status?.decided) return
            if (ownSubmissionRef.current === 'pending') {
                deferredStatusRef.current = status
                return
            }
            finalizeDecided(status)
        },
        [finalizeDecided],
    )

    const checkAndApply = useCallback(async () => {
        if (hasFinalizedRef.current) return
        applyStatus(await checkStatus())
    }, [applyStatus, checkStatus])

    useEffect(() => {
        if (!enabled) return undefined

        void checkAndApply()

        const onVisible = () => {
            if (document.visibilityState === 'visible') void checkAndApply()
        }
        document.addEventListener('visibilitychange', onVisible)

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') void checkAndApply()
        }, OUTPUTS_DECISION_POLL_MS)

        return () => {
            document.removeEventListener('visibilitychange', onVisible)
            clearInterval(interval)
        }
    }, [enabled, checkAndApply])

    // A tab that was disconnected missed any event sent in that window.
    const wasDisconnectedRef = useRef(false)
    useEffect(() => {
        if (!enabled || !socket) return undefined

        const onStatus = ({ status }: { status: WebSocketStatus }) => {
            if (status !== WebSocketStatus.Connected) {
                wasDisconnectedRef.current = true
                return
            }
            if (!wasDisconnectedRef.current) return
            wasDisconnectedRef.current = false
            void checkAndApply()
        }

        socket.on('status', onStatus)
        return () => {
            socket.off('status', onStatus)
        }
    }, [enabled, socket, checkAndApply])

    // The event is a trigger only. Finality and the reviewer's name come from the database, so a
    // forged payload cannot put words in the toast.
    useEffect(() => {
        if (!enabled || !provider) return undefined

        const onStateless = ({ payload }: { payload: unknown }) => {
            const event = tryDecodeStateless(payload)
            if (!event || event.type !== 'outputs-review-submitted') return
            if (event.studyId !== studyId || event.studyJobId !== jobId) return
            if (event.submittedByTabId === tabSessionId) return
            void checkAndApply()
        }

        provider.on('stateless', onStateless)
        return () => {
            provider.off('stateless', onStateless)
        }
    }, [enabled, provider, studyId, jobId, tabSessionId, checkAndApply])

    return { checkStatus, finalizeDecided, setOwnSubmission }
}
