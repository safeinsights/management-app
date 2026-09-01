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
          submittedByTabId: string
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
    | {
          type: 'code-review-submitted'
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
    if (obj.type === 'code-review-submitted') {
        return {
            type: 'code-review-submitted',
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

            if (event.type === 'code-review-submitted') {
                notifications.show({
                    color: 'blue',
                    title: 'Decision submitted',
                    message: `${event.submittedByName} has proceeded to submit a decision on this study code. No further edits are allowed at this point.`,
                    autoClose: NOTIFICATION_DISPLAY_MS,
                })
                router.push(Routes.studyReview({ orgSlug, studyId }))
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
