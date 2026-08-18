'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { useSession } from '@/hooks/session'
import { errorToString } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import {
    acknowledgeLegalDocumentAction,
    fetchStudyAgreementStatusAction,
} from '@/server/actions/legal-document.actions'
import { captureException } from '@sentry/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { StudyAgreementModal } from './study-agreement-modal'

export const useStudyAgreementStatus = (studyId: string) => {
    const { session } = useSession()

    const { data, error } = useQuery({
        queryKey: legalDocumentQueryKeys.studyAgreement(studyId),
        queryFn: () => fetchStudyAgreementStatusAction({ studyId }),
        enabled: Boolean(session),
        // No polling: the mutations the agreement governs are refused server-side, so an unacknowledged
        // user can do nothing from a page left open. Dropping a non-dismissible modal over the code
        // upload page, whose file selection is not autosaved, would cost more than it buys. Refetch on
        // window focus still applies, which also re-mints the presigned URL before it expires.
        refetchInterval: false,
    })

    // Failing open is the right call — the user can do nothing about an unreadable agreement — but a
    // gate that has quietly stopped asking must not also be invisible to us.
    useEffect(() => {
        if (error) captureException(error)
    }, [error])

    return data
}

const usePendingStudyAgreement = (studyId: string) => {
    const status = useStudyAgreementStatus(studyId)
    const queryClient = useQueryClient()
    const router = useRouter()
    const [consentedVersionId, setConsentedVersionId] = useState<string | null>(null)

    const versionId = status?.state === 'pending' ? status.versionId : undefined

    const {
        mutate: acknowledge,
        isPending,
        error,
    } = useMutation({
        mutationFn: (version: string) => acknowledgeLegalDocumentAction({ versionId: version }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: legalDocumentQueryKeys.studyAgreement(studyId) })
        },
    })

    return {
        downloadUrl: status?.state === 'pending' ? status.downloadUrl : undefined,
        // Keyed to the version that was on screen rather than kept as a bare boolean, so a new version
        // published while the modal is open cannot inherit a tick given to the one before it.
        isChecked: consentedVersionId === versionId,
        setIsChecked: (checked: boolean) => setConsentedVersionId(checked ? (versionId ?? null) : null),
        onContinue: () => {
            if (consentedVersionId) acknowledge(consentedVersionId)
        },
        onCancel: () => router.push(Routes.dashboard),
        isSubmitting: isPending,
        // errorToString, not error.message: the wrapped useMutation throws an ActionFailure whose
        // message is the JSON of its field errors.
        error: error ? errorToString(error) : null,
    }
}

/**
 * Study-wide gate: a member of either party owing this study's agreement is blocked until they give it.
 *
 * Mounted in the study layout so it covers every route of the study for both roles — the proposal
 * step, the code pages and the review pages alike — rather than the two pages the design names.
 */
export const RequireStudyAgreement = ({ studyId }: { studyId: string }) => {
    const { downloadUrl, isChecked, setIsChecked, onContinue, onCancel, isSubmitting, error } =
        usePendingStudyAgreement(studyId)

    return (
        <StudyAgreementModal
            isVisible={Boolean(downloadUrl)}
            downloadUrl={downloadUrl}
            isChecked={isChecked}
            onCheckedChange={setIsChecked}
            onContinue={onContinue}
            onCancel={onCancel}
            isSubmitting={isSubmitting}
            error={error}
        />
    )
}
