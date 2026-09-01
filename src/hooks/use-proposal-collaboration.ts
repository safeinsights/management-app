'use client'

import { useState } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { type HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { type CollabFieldKey, type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { useYjsFormMap } from '@/hooks/use-yjs-form-map'

interface Args {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    /** Omit to co-edit every collaborative field. */
    collabKeys?: readonly CollabFieldKey[]
}

interface Return {
    websocketProvider: HocuspocusProviderWebsocket | null
    yjsForm: ReturnType<typeof useYjsFormMap>
    tabSessionId: string
}

// Shared by the proposal-draft and change-requested resubmit flows, which co-edit the same
// `proposal-${studyId}-*` Yjs documents and must not drift apart.
export function useProposalCollaboration({ studyId, form, collabKeys }: Args): Return {
    // One id per mount, so two tabs of the same Clerk user still differ.
    const [tabSessionId] = useState(() => crypto.randomUUID())

    const websocketProvider = useYjsWebsocket()

    const yjsForm = useYjsFormMap({ studyId, form, websocketProvider, collabKeys })

    return { websocketProvider, yjsForm, tabSessionId }
}
