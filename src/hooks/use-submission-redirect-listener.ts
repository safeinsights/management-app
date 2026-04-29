'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { Routes } from '@/lib/routes'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'

export type SubmissionEvent =
    | {
          type: 'proposal-submitted'
          studyId: string
          submittedByUserId: string
          submittedByName: string
          orgName: string
      }
    | {
          type: 'proposal-review-submitted'
          studyId: string
          submittedByUserId: string
          submittedByName: string
      }

const SUBMISSION_KEY = '_submission'

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const parseSubmissionEvent = (raw: unknown): SubmissionEvent | null => {
    if (typeof raw !== 'object' || raw === null) return null
    const obj = raw as Record<string, unknown>
    if (!isString(obj.studyId) || !isString(obj.submittedByUserId) || !isString(obj.submittedByName)) {
        return null
    }
    if (obj.type === 'proposal-submitted' && isString(obj.orgName)) {
        return {
            type: 'proposal-submitted',
            studyId: obj.studyId,
            submittedByUserId: obj.submittedByUserId,
            submittedByName: obj.submittedByName,
            orgName: obj.orgName,
        }
    }
    if (obj.type === 'proposal-review-submitted') {
        return {
            type: 'proposal-review-submitted',
            studyId: obj.studyId,
            submittedByUserId: obj.submittedByUserId,
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
    /** Provider whose stateless channel and Y.Doc map carry the submission event. */
    provider: HocuspocusProvider | null
    /**
     * The form-level Y.Map (already obtained via `ydoc.getMap('fields')`) for Layer 2
     * sentinel pickup. Pass undefined when the listener is mounted on a doc without
     * a structured fields map (e.g. the DO review-feedback doc) — Layer 2 falls back
     * to a sentinel stored under the same key on the root Y.Map of the doc.
     */
    fieldsMap?: Y.Map<unknown>
    orgSlug: string
    studyId: string
    /**
     * If the current user submitted, the mutation already navigated; the listener
     * should still no-op cleanly when the same client receives its own broadcast.
     */
    currentUserId: string | null | undefined
    enabled?: boolean
}

export function useSubmissionRedirectListener({
    provider,
    fieldsMap,
    orgSlug,
    studyId,
    currentUserId,
    enabled = true,
}: Args) {
    const router = useRouter()
    const hasFiredRef = useRef(false)

    useEffect(() => {
        if (!enabled || !provider) return

        const handle = (event: SubmissionEvent) => {
            if (hasFiredRef.current) return
            if (event.studyId !== studyId) return
            // Submitter's own tab navigates from its mutation onSuccess; if the same
            // tab also receives the broadcast, skip the duplicate toast/redirect.
            if (event.submittedByUserId === currentUserId) {
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

        const target: Y.Map<unknown> = fieldsMap ?? provider.document.getMap(SUBMISSION_KEY)
        // Layer 2: late-arriving sync of the persisted CRDT key.
        const initial = target.get(SUBMISSION_KEY)
        if (initial !== undefined) {
            const event = tryDecodeStateless(initial)
            if (event) handle(event)
        }
        const onMapChange = () => {
            const current = target.get(SUBMISSION_KEY)
            if (current === undefined) return
            const event = tryDecodeStateless(current)
            if (event) handle(event)
        }
        target.observe(onMapChange)

        return () => {
            provider.off('stateless', onStateless)
            target.unobserve(onMapChange)
        }
    }, [provider, fieldsMap, orgSlug, studyId, currentUserId, enabled, router])
}

export const SUBMISSION_SENTINEL_KEY = SUBMISSION_KEY
