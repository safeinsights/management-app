'use client'

import { Alert } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react'
import type { FC } from 'react'
import { useStudyAgreementStatus } from './require-study-agreement'
import { STUDY_AGREEMENT_LABEL } from './study-agreement-modal'

const MESSAGE = `Your ${STUDY_AGREEMENT_LABEL} is being prepared. You'll be asked to review and acknowledge it here once it is ready.`

type Props = {
    studyId: string
    /** Set by the caller for the proposal states where an agreement is drawn up at all. */
    isVisible: boolean
}

/**
 * Says an agreement is on its way, on the proposal step of both parties.
 *
 * Deliberately not a gate: an approved study with no agreement yet must still let code be uploaded
 * and reviewed, or every study would stall on SI admin paperwork.
 */
export const StudyAgreementPreparingNotice: FC<Props> = ({ studyId, isVisible }) => {
    const status = useStudyAgreementStatus(studyId)

    if (!isVisible || status?.state !== 'none') return null

    return (
        <Alert icon={<InfoIcon weight="fill" />} color="blue">
            {MESSAGE}
        </Alert>
    )
}
