'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { HocuspocusProvider } from '@hocuspocus/provider'

import { Routes } from '@/lib/routes'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'

export type SubmissionEvent =
    | {
          type: 'proposal-submitted'
          studyId: string
          /** Per-mount tab session id of the broadcasting client. Used to skip the broadcaster's own tab. */
          submittedByTabId: string
          /** Clerk user id of the broadcaster. Server compares against the authenticated connection user. */
          submittedByClerkId: string
          submittedByName: string
          orgName: string
      }
    | {
          type: 'proposal-review-submitted'
          studyId: string
          submittedByTabId: string
          submittedByClerkId: string
          submittedByName: string
      }

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
    if (obj.type === 'proposal-submitted' && isString(obj.orgName)) {
        return {
            type: 'proposal-submitted',
            studyId: obj.studyId,
            submittedByTabId: obj.submittedByTabId,
            submittedByClerkId: obj.submittedByClerkId,
            submittedByName: obj.submittedByName,
            orgName: obj.orgName,
        }
    }
    if (obj.type === 'proposal-review-submitted') {
        return {
            type: 'proposal-review-submitted',
            studyId: obj.studyId,
            submittedByTabId: obj.submittedByTabId,
            submittedByClerkId: obj.submittedByClerkId,
            submittedByName: obj.submittedByName,
        }
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
    /** Provider whose stateless channel carries the submission event. */
    provider: HocuspocusProvider | null
    orgSlug: string
    studyId: string
    /**
     * Tab session id for the current mount. Used to skip the broadcaster's own tab so
     * its mutation onSuccess is the only navigation path. MUST match the value the
     * broadcaster places on the outgoing event, otherwise the broadcaster's own tab
     * will double-navigate. Other tabs of the same user have different ids and still
     * receive the kick-out flow.
     */
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
            // The broadcaster's own tab navigates from its mutation onSuccess; if the
            // same tab also receives the broadcast, skip the duplicate toast/redirect.
            // Compare on tab id so a same-user OTHER tab still gets the AC-required
            // kick-out (per the plan's "Same-user multiple tabs: also redirect").
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

            notifications.show({
                color: 'blue',
                title: 'Decision submitted',
                message: `${event.submittedByName} has proceeded to submit a decision on this study proposal. No further edits are allowed at this point.`,
                autoClose: NOTIFICATION_DISPLAY_MS,
            })
            router.push(Routes.studyReview({ orgSlug, studyId }))
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
