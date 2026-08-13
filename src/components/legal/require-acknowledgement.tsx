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
    const [consentedVersionId, setConsentedVersionId] = useState<string | null>(null)

    const { data: documents = NO_DOCUMENTS } = useQuery({
        queryKey: legalDocumentQueryKeys.pendingAcknowledgements(),
        queryFn: () => fetchPendingLegalAcknowledgementsAction(),
        enabled: Boolean(session),
    })

    // Asking about one document at a time keeps the ack row, the rendered text and the ticked box a
    // single unit. The rest of the list arrives on the refetch below.
    const document = documents[0]

    const {
        mutate: acknowledge,
        isPending,
        error,
    } = useMutation({
        // actionResult is what makes a failure visible at all: actions resolve with { error } rather
        // than rejecting, so without it a refused acknowledgement would run onSuccess and silently
        // reopen the modal saying nothing.
        mutationFn: async (versionId: string) => actionResult(await acknowledgeLegalDocumentAction({ versionId })),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: legalDocumentQueryKeys.pendingAcknowledgements() })
        },
    })

    return {
        document,
        // Consent is keyed to the version that was on screen rather than kept as a bare boolean. The
        // query can refetch while the modal is open, so a document published mid-read would otherwise
        // inherit a tick given to the one before it — and these rows are the compliance evidence.
        isChecked: consentedVersionId === document?.versionId,
        setIsChecked: (checked: boolean) => setConsentedVersionId(checked ? (document?.versionId ?? null) : null),
        onContinue: () => {
            if (consentedVersionId) acknowledge(consentedVersionId)
        },
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
    const { document, isChecked, setIsChecked, onContinue, isSubmitting, error } = usePendingLegalAcknowledgements()

    return (
        <LegalAcknowledgementModal
            isVisible={Boolean(document)}
            document={document}
            isChecked={isChecked}
            onCheckedChange={setIsChecked}
            onContinue={onContinue}
            onSignOut={signOut}
            isSubmitting={isSubmitting}
            error={error}
        />
    )
}
