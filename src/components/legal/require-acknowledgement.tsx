'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { useSession } from '@/hooks/session'
import { useSignOut } from '@/hooks/use-sign-out'
import { actionResult } from '@/lib/utils'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import {
    acknowledgeLegalDocumentAction,
    fetchPendingLegalAcknowledgementsAction,
} from '@/server/actions/legal-document.actions'
import { useState } from 'react'
import type { PendingLegalDocument } from './acknowledgement-copy'
import { LegalAcknowledgementModal } from './acknowledgement-modal'

const NO_DOCUMENTS: PendingLegalDocument[] = []

function usePendingLegalAcknowledgements() {
    const { session } = useSession()
    const queryClient = useQueryClient()
    const [isChecked, setIsChecked] = useState(false)

    const { data: documents = NO_DOCUMENTS } = useQuery({
        queryKey: legalDocumentQueryKeys.pendingAcknowledgements(),
        queryFn: () => fetchPendingLegalAcknowledgementsAction(),
        enabled: Boolean(session),
    })

    const {
        mutate: acknowledge,
        isPending,
        error,
    } = useMutation({
        // One row per document, so the evidence stays per-document however many checkboxes were
        // shown. actionResult is what makes a failure visible at all: actions resolve with
        // { error } rather than rejecting, so without it a refused acknowledgement would run
        // onSuccess and silently reopen the modal saying nothing. A partial failure is safe to
        // retry — the acks are idempotent and the modal re-renders with whatever is outstanding.
        mutationFn: async (pending: PendingLegalDocument[]) => {
            await Promise.all(
                pending.map(async (document) =>
                    actionResult(await acknowledgeLegalDocumentAction({ versionId: document.versionId })),
                ),
            )
            return { acknowledged: true }
        },
        onSuccess: async () => {
            setIsChecked(false)
            await queryClient.invalidateQueries({ queryKey: legalDocumentQueryKeys.pendingAcknowledgements() })
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
