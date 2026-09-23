'use client'

import { Alert } from '@mantine/core'
import { WarningCircleIcon } from '@phosphor-icons/react'
import type { FC } from 'react'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { useStudyAgreementStatus } from './require-study-agreement'

type Props = {
    studyId: string
    /** Clause naming what the wait blocks for this reader, without a trailing period. */
    consequence: string
    isVisible?: boolean
}

// Warning rather than info: an approved study with no agreement is now stalled, not merely waiting.
// A test study is exempt, and reads as `exempt` rather than `none`.
export const StudyAgreementPreparingNotice: FC<Props> = ({ studyId, consequence, isVisible = true }) => {
    const { status, isUnreadable } = useStudyAgreementStatus(studyId)

    if (!isVisible) return null

    // Unreadable blocks work exactly as `none` does, so it must not do so silently.
    if (isUnreadable)
        return (
            <Alert
                icon={<WarningCircleIcon weight="fill" />}
                color="yellow"
                title={`${legalDocumentTypeLabels.SLA} could not be checked`}
            >
                We could not check this study&apos;s {legalDocumentTypeLabels.SLA}. Reload the page; if this keeps
                happening, contact support.
            </Alert>
        )

    if (status?.state !== 'none') return null

    return (
        <Alert icon={<WarningCircleIcon weight="fill" />} color="yellow" title="Study agreements are being prepared">
            {consequence} until the required {status.researchLabName} and {status.dataPartnerName} signatories have
            signed the study agreements. If you are included in this study, you will be notified when your agreement is
            ready for acknowledgement.
        </Alert>
    )
}
