'use client'

import { Alert } from '@mantine/core'
import { WarningCircleIcon } from '@phosphor-icons/react'
import type { FC } from 'react'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { useStudyAgreementStatus } from './require-study-agreement'

const TITLE = `${legalDocumentTypeLabels.SLA} is being prepared`

const MESSAGE = `The required Research Lab and Data Partner signatories have not yet signed the ${legalDocumentTypeLabels.SLA}. If you are included in this study, you will be notified when your agreement is ready for acknowledgement.`

type Props = {
    studyId: string
    /** Set by the caller for the proposal states where an agreement is drawn up at all. */
    isVisible: boolean
    /** What the wait blocks for this reader. The reviewer call sites are not submitting code. */
    consequence?: string
}

// Warning rather than info: an approved study with no agreement is now stalled, not merely waiting.
// A test study is exempt, and reads as `exempt` rather than `none`.
export const StudyAgreementPreparingNotice: FC<Props> = ({ studyId, isVisible, consequence }) => {
    const status = useStudyAgreementStatus(studyId)

    if (!isVisible || status?.state !== 'none') return null

    return (
        <Alert icon={<WarningCircleIcon weight="fill" />} color="yellow" title={TITLE}>
            {consequence ? `${consequence} ${MESSAGE}` : MESSAGE}
        </Alert>
    )
}
