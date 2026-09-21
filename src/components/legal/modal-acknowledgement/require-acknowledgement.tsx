'use client'

import { useQuery } from '@/common'
import { useSession } from '@/hooks/session'
import { useSignOut } from '@/hooks/use-sign-out'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchNextPendingLegalAcknowledgementAction } from '@/server/actions/legal-document.actions'
import { captureException } from '@sentry/nextjs'
import { useEffect } from 'react'
import { LegalAcknowledgementModal } from './acknowledgement-modal'
import { useAcknowledgementConsent } from '../use-acknowledgement-consent'

// One document at a time keeps the ack row, the rendered text and the ticked box a single unit.
function useNextPendingLegalAcknowledgement() {
    const { session } = useSession()

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

    const consent = useAcknowledgementConsent({
        versionId: document?.versionId,
        invalidateKey: legalDocumentQueryKeys.nextPendingAcknowledgement(),
    })

    return { document, ...consent }
}

// Mounted in AppShell rather than on login, so it catches users already signed in when a
// document was published; `/account/*` renders outside it, keeping MFA and key setup unblocked.
export const RequireLegalAcknowledgement = () => {
    const signOut = useSignOut()
    const { document, ...consent } = useNextPendingLegalAcknowledgement()

    return (
        <LegalAcknowledgementModal isVisible={Boolean(document)} document={document} onSignOut={signOut} {...consent} />
    )
}
