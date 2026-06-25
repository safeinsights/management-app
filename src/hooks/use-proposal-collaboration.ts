'use client'

import { useState } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { type HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { useYjsFormMap } from '@/hooks/use-yjs-form-map'

interface Args {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
}

interface Return {
    websocketProvider: HocuspocusProviderWebsocket | null
    yjsForm: ReturnType<typeof useYjsFormMap>
    /** Stable per-mount tab id used to de-dupe the broadcaster's own kick-out broadcast. */
    tabSessionId: string
}

// Shared collaboration wiring for the proposal-draft and change-requested resubmit
// flows. Both surfaces co-edit the same `proposal-${studyId}-*` Yjs documents, so
// they need the same per-mount tab id, websocket, and form map. Keeping it here
// avoids the two providers drifting apart.
export function useProposalCollaboration({ studyId, form }: Args): Return {
    // One id per mount of the provider. Different tabs get different ids even for
    // the same Clerk user, which is what the listener compares against to skip
    // only the broadcaster's own tab.
    const [tabSessionId] = useState(() => crypto.randomUUID())

    const websocketProvider = useYjsWebsocket()

    const yjsForm = useYjsFormMap({ studyId, form, websocketProvider })

    return { websocketProvider, yjsForm, tabSessionId }
}
