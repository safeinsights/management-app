'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { useSession } from '@/hooks/session'
import { useSignOut } from '@/hooks/use-sign-out'
import {
    acknowledgeLegalDocumentAction,
    fetchPendingLegalAcknowledgementsAction,
} from '@/server/actions/legal-document.actions'
import { useState } from 'react'
import type { PendingLegalDocument } from './legal-acknowledgement-copy'
import { LegalAcknowledgementModal } from './legal-acknowledgement-modal'

export const PENDING_LEGAL_ACKNOWLEDGEMENTS_QUERY_KEY = ['pendingLegalAcknowledgements']

const NO_DOCUMENTS: PendingLegalDocument[] = []

function usePendingLegalAcknowledgements() {
    const { session } = useSession()
    const queryClient = useQueryClient()
    const [isChecked, setIsChecked] = useState(false)

    const { data: documents = NO_DOCUMENTS } = useQuery({
        queryKey: PENDING_LEGAL_ACKNOWLEDGEMENTS_QUERY_KEY,
        queryFn: () => fetchPendingLegalAcknowledgementsAction(),
        enabled: Boolean(session),
    })

    const {
        mutate: acknowledge,
        isPending,
        error,
    } = useMutation({
        // One row per document, so the evidence stays per-document however many checkboxes were
        // shown. A partial failure is safe: the written acks are idempotent and the modal simply
        // re-renders with whatever is still outstanding.
        mutationFn: async (pending: PendingLegalDocument[]) =>
            await Promise.all(
                pending.map((document) => acknowledgeLegalDocumentAction({ versionId: document.versionId })),
            ).then(() => ({ acknowledged: true })),
        onSuccess: async () => {
            setIsChecked(false)
            await queryClient.invalidateQueries({ queryKey: PENDING_LEGAL_ACKNOWLEDGEMENTS_QUERY_KEY })
        },
    })

    return {
        documents,
        isChecked,
        setIsChecked,
        onContinue: () => acknowledge(documents),
        isSubmitting: isPending,
        error: error?.message ?? null,
    }
}

/**
 * App-wide gate: any user owing an acknowledgement is blocked until they give it.
 *
 * Mounted in AppShell rather than hooked to a login event, so it also catches a user who was already
 * signed in when a document was published and never logs in again. `/account/*` renders outside
 * AppShell, which keeps MFA enrolment and key setup unblocked without any per-route wiring.
 */
export const RequireLegalAcknowledgement = () => {
    const signOut = useSignOut()
    const { documents, isChecked, setIsChecked, onContinue, isSubmitting, error } = usePendingLegalAcknowledgements()

    return (
        <LegalAcknowledgementModal
            isVisible={documents.length > 0}
            documents={documents}
            isChecked={isChecked}
            onCheckedChange={setIsChecked}
            onContinue={onContinue}
            onSignOut={signOut}
            isSubmitting={isSubmitting}
            error={error}
        />
    )
}
