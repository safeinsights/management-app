'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { useSession } from '@/hooks/session'
import { useSignOut } from '@/hooks/use-sign-out'
import { errorToString } from '@/lib/errors'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import {
    acknowledgeLegalDocumentAction,
    fetchNextPendingLegalAcknowledgementAction,
} from '@/server/actions/legal-document.actions'
import { captureException } from '@sentry/nextjs'
import { useEffect, useState } from 'react'
import { LegalAcknowledgementModal } from './acknowledgement-modal'

// Asking about one document at a time keeps the ack row, the rendered text and the ticked box a
// single unit. Any others arrive on the refetch below.
function useNextPendingLegalAcknowledgement() {
    const { session } = useSession()
    const queryClient = useQueryClient()
    const [consentedVersionId, setConsentedVersionId] = useState<string | null>(null)

    const { data: document, error: readError } = useQuery({
        queryKey: legalDocumentQueryKeys.nextPendingAcknowledgement(),
        queryFn: () => fetchNextPendingLegalAcknowledgementAction(),
        enabled: Boolean(session),
    })

    // An unreadable document leaves the gate open, which is the right call — the user can do nothing
    // about it and the compliance artifact is the ack row, not the blocking. But a gate that has
    // quietly stopped asking must not also be invisible to us.
    useEffect(() => {
        if (readError) captureException(readError)
    }, [readError])

    const {
        mutate: acknowledge,
        isPending,
        error,
    } = useMutation({
        mutationFn: (versionId: string) => acknowledgeLegalDocumentAction({ versionId }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: legalDocumentQueryKeys.nextPendingAcknowledgement() })
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
        // errorToString, not error.message: the wrapped useMutation throws an ActionFailure whose
        // message is the JSON of its field errors, which is what the modal would otherwise display.
        error: error ? errorToString(error) : null,
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
    const { document, isChecked, setIsChecked, onContinue, isSubmitting, error } = useNextPendingLegalAcknowledgement()

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
