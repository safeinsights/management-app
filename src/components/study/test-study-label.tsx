'use client'

import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { type FC } from 'react'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { StudyPill } from './study-pill'

const LABEL = 'Test study'
const TOOLTIP = `A test study does not have ${legalDocumentCollectionLabels.SLA}.`

export const TestStudyLabel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <StudyPill
            label={LABEL}
            bg="blue.0"
            c="blue.9"
            tooltip={TOOLTIP}
            icon={<InfoIcon size={12} weight="fill" aria-hidden />}
        />
    )
}
