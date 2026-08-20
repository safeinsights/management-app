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
        // No polling: the guarded mutations already refuse an unacknowledged user, so a modal landing
        // on the code upload page — whose file selection is not autosaved — would cost more than it
        // buys. Window-focus refetch still applies, and re-mints the presigned URL before it expires.
        refetchInterval: false,
    })

    // Failing open is right — the user cannot fix an unreadable agreement — but a gate that has
    // quietly stopped asking must not also be invisible to us.
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
        // Keyed to the version on screen, not a bare boolean: a version published while the modal is
        // open must not inherit a tick given to the one before it.
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

// Blocks a member of either party who owes this study's agreement. Mounted in the study layout, so
// it covers every route of the study for both roles.
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
