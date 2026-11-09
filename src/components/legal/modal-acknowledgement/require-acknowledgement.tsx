'use client'

import { useQuery } from '@/common'
import { useSession } from '@/hooks/session'
import { useSignOut } from '@/hooks/use-sign-out'
import { Routes } from '@/lib/routes'
import {
    isGlobalLegalDocumentType,
    legalDocumentQueryKeys,
    type PendingAcknowledgement,
    type PendingGlobalAcknowledgement,
    type PendingLegalDocument,
} from '@/schema/legal-document'
import { fetchNextPendingLegalAcknowledgementAction } from '@/server/actions/legal-acknowledgement.actions'
import { captureException } from '@sentry/nextjs'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { LegalAcknowledgementModal } from './acknowledgement-modal'
import { GlobalAcknowledgementModal } from './global-acknowledgement-modal'
import { useAcknowledgementConsent } from '../use-acknowledgement-consent'

const NOTHING_PENDING: PendingAcknowledgement[] = []

const isGlobalDocument = (document: PendingAcknowledgement): document is PendingGlobalAcknowledgement =>
    isGlobalLegalDocumentType(document.type)

const isAgreement = (document: PendingAcknowledgement): document is PendingLegalDocument => !isGlobalDocument(document)

// The gate links to /legal in a new tab, so that page has to stay readable while it is owed.
const isLegalPage = (pathname: string) => pathname === Routes.legal || pathname.startsWith(`${Routes.legal}/`)

// One group at a time keeps the ack rows, the copy and the ticked box a single unit: tos and pn
// together, a ropa/dopa alone.
function useNextPendingLegalAcknowledgement() {
    const { session } = useSession()
    const isExempt = isLegalPage(usePathname())

    const { data, error: readError } = useQuery({
        queryKey: legalDocumentQueryKeys.nextPendingAcknowledgement(),
        queryFn: () => fetchNextPendingLegalAcknowledgementAction(),
        enabled: Boolean(session) && !isExempt,
    })

    // An unreadable document leaves the gate open, since the compliance artifact is the ack row
    // rather than the blocking; report it so the silence is not also invisible to us.
    useEffect(() => {
        if (readError) captureException(readError)
    }, [readError])

    // Cached data from an earlier page would otherwise still cover /legal.
    const documents = isExempt ? NOTHING_PENDING : (data ?? NOTHING_PENDING)

    const consent = useAcknowledgementConsent({
        versionIds: documents.map((document) => document.versionId),
        invalidateKey: legalDocumentQueryKeys.nextPendingAcknowledgement(),
    })

    return {
        globalDocuments: documents.filter(isGlobalDocument),
        agreement: documents.find(isAgreement),
        consent,
    }
}

// Mounted in AppShell rather than on login, so it catches users already signed in when a
// document was published; `/account/*` renders outside it, keeping MFA and key setup unblocked.
export const RequireLegalAcknowledgement = () => {
    const signOut = useSignOut()
    const { globalDocuments, agreement, consent } = useNextPendingLegalAcknowledgement()

    return (
        <>
            <GlobalAcknowledgementModal
                isVisible={globalDocuments.length > 0}
                documents={globalDocuments}
                {...consent}
            />
            <LegalAcknowledgementModal
                isVisible={Boolean(agreement)}
                document={agreement}
                onSignOut={signOut}
                {...consent}
            />
        </>
    )
}
