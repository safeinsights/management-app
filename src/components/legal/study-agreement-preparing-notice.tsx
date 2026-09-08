'use client'

import { Alert } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react'
import type { FC } from 'react'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { useStudyAgreementStatus } from './require-study-agreement'

const MESSAGE = `Your ${legalDocumentTypeLabels.SLA} is being prepared. You'll be asked to review and acknowledge it here once it is ready.`

type Props = {
    studyId: string
    /** Set by the caller for the proposal states where an agreement is drawn up at all. */
    isVisible: boolean
}

// Deliberately not a gate: an approved study with no agreement yet must still let code be uploaded
// and reviewed, or every study stalls on SI admin paperwork.
export const StudyAgreementPreparingNotice: FC<Props> = ({ studyId, isVisible }) => {
    const status = useStudyAgreementStatus(studyId)

    if (!isVisible || status?.state !== 'none') return null

    return (
        <Alert icon={<InfoIcon weight="fill" />} color="blue">
            {MESSAGE}
        </Alert>
    )
}
