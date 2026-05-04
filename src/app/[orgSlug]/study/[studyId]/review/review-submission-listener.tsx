'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { reviewFeedbackDocName } from '@/lib/collaboration-documents'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { useStudyStatusPoll } from '@/hooks/use-study-status-poll'
import { WS_URL } from '@/lib/config'

const REVIEW_EDITABLE_STATUSES = ['PENDING-REVIEW'] as const

type Props = {
    orgSlug: string
    studyId: string
    /** Per-tab id shared with the broadcasting mutation hook, used to skip self-kick-out. */
    tabSessionId: string
    enabled: boolean
}

/**
 * Listener-only Hocuspocus connection for the DO review-feedback document.
 * Separate from the editor's own provider so the listener can be mounted once
 * at the page level and torn down cleanly when the user navigates away.
 */
export function ReviewSubmissionListener({ orgSlug, studyId, tabSessionId, enabled }: Props) {
    const { getToken } = useAuth()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)

    useEffect(() => {
        if (!enabled) return undefined

        const doc = new Y.Doc()
        const docName = reviewFeedbackDocName(studyId)
        const next = new HocuspocusProvider({
            url: WS_URL,
            name: docName,
            document: doc,
            token: async () => (await getToken()) ?? '',
            onAuthenticationFailed: () => {
                // Auth failure here means the listener won't subscribe to stateless
                // events; the user falls through to the status poll for kick-out.
                console.warn(`listener HocuspocusProvider auth failed for ${docName}`)
            },
        } as ConstructorParameters<typeof HocuspocusProvider>[0])
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProvider(next)

        return () => {
            next.destroy()
            doc.destroy()

            setProvider(null)
        }
    }, [enabled, studyId, getToken])

    useSubmissionRedirectListener({
        provider,
        orgSlug,
        studyId,
        currentTabId: tabSessionId,
        enabled,
    })

    useStudyStatusPoll({
        studyId,
        orgSlug,
        editableStatuses: REVIEW_EDITABLE_STATUSES,
        redirectTarget: 'studyReview',
        enabled,
    })

    return null
}
