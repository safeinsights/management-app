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

// One document at a time keeps the ack row, the rendered text and the ticked box a single unit.
function useNextPendingLegalAcknowledgement() {
    const { session } = useSession()
    const queryClient = useQueryClient()
    const [consentedVersionId, setConsentedVersionId] = useState<string | null>(null)

    const { data: document, error: readError } = useQuery({
        queryKey: legalDocumentQueryKeys.nextPendingAcknowledgement(),
        queryFn: () => fetchNextPendingLegalAcknowledgementAction(),
        enabled: Boolean(session),
    })

    // An unreadable document leaves the gate open, since the compliance artifact is the ack row
    // rather than the blocking; report it so the silence is not also invisible to us.
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
        // Keyed to the version on screen: the query can refetch while the modal is open, so a
        // document published mid-read would otherwise inherit the previous one's tick.
        isChecked: consentedVersionId === document?.versionId,
        setIsChecked: (checked: boolean) => setConsentedVersionId(checked ? (document?.versionId ?? null) : null),
        onContinue: () => {
            if (consentedVersionId) acknowledge(consentedVersionId)
        },
        isSubmitting: isPending,
        // errorToString, not error.message: the ActionFailure's message is the JSON of its
        // field errors.
        error: error ? errorToString(error) : null,
    }
}

// Mounted in AppShell rather than on login, so it catches users already signed in when a
// document was published; `/account/*` renders outside it, keeping MFA and key setup unblocked.
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
