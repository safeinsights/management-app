'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { reviewFeedbackDocName } from '@/lib/collaboration-documents'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { useStudyStatusPoll } from '@/hooks/use-study-status-poll'
import { WS_URL } from '@/server/config'

const REVIEW_EDITABLE_STATUSES = ['PENDING-REVIEW'] as const

type Props = {
    orgSlug: string
    studyId: string
    enabled: boolean
}

/**
 * Listener-only Hocuspocus connection for the DO review-feedback document.
 * Separate from the editor's own provider so the listener can be mounted once
 * at the page level and torn down cleanly when the user navigates away.
 */
export function ReviewSubmissionListener({ orgSlug, studyId, enabled }: Props) {
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
    const { user } = useUser()

    useEffect(() => {
        if (!enabled) return undefined

        const doc = new Y.Doc()
        const next = new HocuspocusProvider({
            url: WS_URL,
            name: reviewFeedbackDocName(studyId),
            document: doc,
            token: studyId,
        } as ConstructorParameters<typeof HocuspocusProvider>[0])
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProvider(next)

        return () => {
            next.destroy()
            doc.destroy()

            setProvider(null)
        }
    }, [enabled, studyId])

    useSubmissionRedirectListener({
        provider,
        orgSlug,
        studyId,
        currentUserId: user?.id ?? null,
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
