'use client'

import { useQuery } from '@/common'
import { useSession } from '@/hooks/session'
import { useSignOut } from '@/hooks/use-sign-out'
import { globalAcknowledgementUrl, isLegalPath } from '@/lib/global-acknowledgement-redirect'
import { Routes } from '@/lib/routes'
import {
    isGlobalLegalDocumentType,
    legalDocumentQueryKeys,
    type PendingAcknowledgement,
    type PendingLegalDocument,
} from '@/schema/legal-document'
import { fetchNextPendingLegalAcknowledgementAction } from '@/server/actions/legal-acknowledgement.actions'
import { captureException } from '@sentry/nextjs'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { LegalAcknowledgementModal } from './acknowledgement-modal'
import { useAcknowledgementConsent } from '../use-acknowledgement-consent'

const NOTHING_PENDING: PendingAcknowledgement[] = []

const isAgreement = (document: PendingAcknowledgement): document is PendingLegalDocument =>
    !isGlobalLegalDocumentType(document.type)

// One group at a time keeps the ack rows, the copy and the ticked box a single unit: tos and pn
// together, a ropa/dopa alone.
function useNextPendingLegalAcknowledgement() {
    const { session } = useSession()
    const isExempt = isLegalPath(usePathname())

    const {
        data,
        error: readError,
        isFetching,
    } = useQuery({
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
    const agreement = documents.find(isAgreement)

    const consent = useAcknowledgementConsent({
        versionIds: agreement ? [agreement.versionId] : [],
        invalidateKey: legalDocumentQueryKeys.nextPendingAcknowledgement(),
    })

    return {
        // Not while refetching: the tos/pn step only marks this query stale, so on returning to the
        // app it still holds the pre-ack answer until the refetch lands.
        owesGlobal: !isFetching && documents.some((document) => isGlobalLegalDocumentType(document.type)),
        agreement,
        consent,
    }
}

// The layout sends a user owing the ToS/PN to their own page on a full load. This catches a
// version published while they were already in the app, where client navigation skips the layout.
function useRedirectToGlobalAcknowledgement(owesGlobal: boolean) {
    const router = useRouter()
    const pathname = usePathname()
    const query = useSearchParams().toString()

    // Already on the step, a second replace before this unmounts would point it back at itself.
    const isOnStep = pathname === Routes.accountAgreements

    useEffect(() => {
        if (owesGlobal && !isOnStep) {
            router.replace(globalAcknowledgementUrl(query ? `${pathname}?${query}` : pathname))
        }
    }, [owesGlobal, isOnStep, router, pathname, query])
}

// Mounted in AppShell rather than on login, so it catches users already signed in when a
// document was published; `/account/*` renders outside it, keeping MFA and key setup unblocked.
export const RequireLegalAcknowledgement = () => {
    const signOut = useSignOut()
    const { owesGlobal, agreement, consent } = useNextPendingLegalAcknowledgement()
    useRedirectToGlobalAcknowledgement(owesGlobal)

    return (
        <LegalAcknowledgementModal
            isVisible={Boolean(agreement)}
            document={agreement}
            onSignOut={signOut}
            {...consent}
        />
    )
}
