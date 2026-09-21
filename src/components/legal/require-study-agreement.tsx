'use client'

import { useQuery } from '@/common'
import { useSession } from '@/hooks/session'
import { Routes } from '@/lib/routes'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchStudyAgreementStatusAction } from '@/server/actions/legal-document.actions'
import { captureException } from '@sentry/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { StudyAgreementModal } from './study-agreement-modal'
import { useAcknowledgementConsent } from './use-acknowledgement-consent'

export const useStudyAgreementStatus = (studyId: string) => {
    const { session } = useSession()

    const { data, error, isError } = useQuery({
        queryKey: legalDocumentQueryKeys.studyAgreement(studyId),
        queryFn: () => fetchStudyAgreementStatusAction({ studyId }),
        enabled: Boolean(session),
        // The server guards already refuse an unacknowledged user, so a modal landing mid-session on
        // the code upload page would cost more than it buys. Window-focus refetch still applies.
        refetchInterval: false,
    })

    // Failing open is right, but a gate that has quietly stopped asking must not also be invisible.
    useEffect(() => {
        if (error) captureException(error)
    }, [error])

    // A gate that cannot be read blocks work just as a missing agreement does, so callers have to
    // be able to tell the two apart and say which one the reader is looking at.
    return { status: data, isUnreadable: isError }
}

const usePendingStudyAgreement = (studyId: string) => {
    const { status } = useStudyAgreementStatus(studyId)
    const router = useRouter()

    const versionId = status?.state === 'pending' ? status.versionId : undefined
    const consent = useAcknowledgementConsent({
        versionId,
        invalidateKey: legalDocumentQueryKeys.studyAgreement(studyId),
    })

    // Cancel goes to the dashboard: this blocks one study, not the app.
    return { versionId, onCancel: () => router.push(Routes.dashboard), ...consent }
}

// Blocks a member of either party who owes this study's agreement. Mounted in the study layout, so
// it covers every route of the study for both roles.
export const RequireStudyAgreement = ({ studyId }: { studyId: string }) => (
    <StudyAgreementModal {...usePendingStudyAgreement(studyId)} />
)
