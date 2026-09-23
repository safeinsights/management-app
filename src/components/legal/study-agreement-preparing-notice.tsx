'use client'

import type { FC } from 'react'
import { StatusAlert } from '@/components/study/status-alert'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { useStudyAgreementStatus } from './require-study-agreement'

const PREPARING_TITLE = 'Study agreements are being prepared'

type Props = {
    studyId: string
    /** Clause naming what the wait blocks for this reader, without a trailing period. */
    consequence: string
    isVisible?: boolean
    /** Informative sits inside a step card beside its decision banner and omits the notify note. */
    tone?: 'informative' | 'action'
}

// Warning rather than info: an approved study with no agreement is now stalled, not merely waiting.
// A test study is exempt, and reads as `exempt` rather than `none`.
export const StudyAgreementPreparingNotice: FC<Props> = ({
    studyId,
    consequence,
    isVisible = true,
    tone = 'action',
}) => {
    const { status, isUnreadable } = useStudyAgreementStatus(studyId)

    if (!isVisible) return null

    // Unreadable blocks work exactly as `none` does, so it must not do so silently.
    if (isUnreadable)
        return (
            <StatusAlert variant="action" title={`${legalDocumentTypeLabels.SLA} could not be checked`}>
                We could not check this study&apos;s {legalDocumentTypeLabels.SLA}. Reload the page; if this keeps
                happening, contact support.
            </StatusAlert>
        )

    if (status?.state !== 'none') return null

    const signatories = `${consequence} until the required ${status.researchLabName} and ${status.dataPartnerName} signatories have signed the study agreements.`

    if (tone === 'informative')
        return (
            <StatusAlert variant="informative" title={PREPARING_TITLE}>
                {signatories}
            </StatusAlert>
        )

    return (
        <StatusAlert variant="action" title={PREPARING_TITLE}>
            {signatories} If you are included in this study, you will be notified when your agreement is ready for
            acknowledgement.
        </StatusAlert>
    )
}
