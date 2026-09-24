'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { HocuspocusProvider } from '@hocuspocus/provider'

import { Routes } from '@/lib/routes'
import { showOrReplaceNotification } from '@/components/errors'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'
import { OUTPUTS_DECIDED_NOTIFICATION_ID } from '@/lib/outputs-review'

// The three decision rounds carry an identical payload and differ only in which round closed, so
// they share one member rather than three copies of the same four fields.
const DECISION_EVENT_TYPES = ['proposal-review-submitted', 'code-review-submitted', 'outputs-review-submitted'] as const

export type DecisionEventType = (typeof DECISION_EVENT_TYPES)[number]

const isDecisionEventType = (value: unknown): value is DecisionEventType =>
    DECISION_EVENT_TYPES.includes(value as DecisionEventType)

// What the peer's decision closed, per round. Together, so a copy change can be read at a glance.
const DECISION_SUBJECT: Record<DecisionEventType, string> = {
    'proposal-review-submitted': 'this study proposal',
    'code-review-submitted': 'this output',
    'outputs-review-submitted': 'this output',
}

type SubmissionEventBase = {
    studyId: string
    submittedByTabId: string
    submittedByClerkId: string
    submittedByName: string
}

export type SubmissionEvent =
    | ({ type: 'proposal-submitted'; orgName: string } & SubmissionEventBase)
    | ({ type: DecisionEventType } & SubmissionEventBase)

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const parseSubmissionEvent = (raw: unknown): SubmissionEvent | null => {
    if (typeof raw !== 'object' || raw === null) return null
    const obj = raw as Record<string, unknown>
    if (
        !isString(obj.studyId) ||
        !isString(obj.submittedByTabId) ||
        !isString(obj.submittedByClerkId) ||
        !isString(obj.submittedByName)
    ) {
        return null
    }
    const base: SubmissionEventBase = {
        studyId: obj.studyId,
        submittedByTabId: obj.submittedByTabId,
        submittedByClerkId: obj.submittedByClerkId,
        submittedByName: obj.submittedByName,
    }
    if (obj.type === 'proposal-submitted' && isString(obj.orgName)) {
        return { type: 'proposal-submitted', ...base, orgName: obj.orgName }
    }
    if (isDecisionEventType(obj.type)) {
        return { type: obj.type, ...base }
    }
    return null
}

const tryDecodeStateless = (payload: unknown): SubmissionEvent | null => {
    let raw: unknown = payload
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw)
        } catch {
            return null
        }
    }
    return parseSubmissionEvent(raw)
}

type Args = {
    provider: HocuspocusProvider | null
    orgSlug: string
    studyId: string
    /** Must match the id the broadcaster puts on the outgoing event, or that tab double-navigates. */
    currentTabId: string
    enabled?: boolean
}

export function useSubmissionRedirectListener({ provider, orgSlug, studyId, currentTabId, enabled = true }: Args) {
    const router = useRouter()
    const hasFiredRef = useRef(false)

    useEffect(() => {
        if (!enabled || !provider) return

        const handle = (event: SubmissionEvent) => {
            if (hasFiredRef.current) return
            if (event.studyId !== studyId) return
            // The broadcaster's own tab already navigated from its mutation onSuccess. Compared on
            // tab id, not user, so the same user's other tabs still get kicked out.
            if (event.submittedByTabId === currentTabId) {
                hasFiredRef.current = true
                return
            }
            hasFiredRef.current = true

            if (event.type === 'proposal-submitted') {
                notifications.show({
                    color: 'blue',
                    title: 'Proposal submitted',
                    message: `${event.submittedByName} has proceeded to submit this study proposal to ${event.orgName}. No further edits are allowed at this point.`,
                    autoClose: NOTIFICATION_DISPLAY_MS,
                })
                router.push(Routes.studySubmitted({ orgSlug, studyId }))
                return
            }

            showOrReplaceNotification({
                // Only the outputs round shares an id, with the status backstop that may reach the
                // same conclusion a moment later through this tab's own failed submit.
                id: event.type === 'outputs-review-submitted' ? OUTPUTS_DECIDED_NOTIFICATION_ID : undefined,
                color: 'blue',
                title: 'Decision submitted',
                message: `${event.submittedByName} has proceeded to submit a decision on ${DECISION_SUBJECT[event.type]}. No further edits are allowed at this point.`,
                autoClose: NOTIFICATION_DISPLAY_MS,
            })
            router.push(Routes.studyReview({ orgSlug, studyId }))
            // An open review screen and the decided screen that replaces it can answer the same URL,
            // where the push alone is a no-op that leaves the open form mounted.
            router.refresh()
        }

        const onStateless = (data: { payload: unknown }) => {
            const event = tryDecodeStateless(data?.payload)
            if (event) handle(event)
        }

        provider.on('stateless', onStateless)

        return () => {
            provider.off('stateless', onStateless)
        }
    }, [provider, orgSlug, studyId, currentTabId, enabled, router])
}
