'use client'

import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { type FC } from 'react'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { StudyPill } from './study-pill'
import { Text } from '@mantine/core'

const LABEL = 'Test study'
const TOOLTIP = `A test study does not have ${legalDocumentCollectionLabels.SLA}.`

export const TestStudyLabel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <StudyPill
            label={LABEL}
            bg="gray.2"
            c="black"
            tooltip={TOOLTIP}
            icon={<InfoIcon size={12} weight="fill" aria-hidden />}
        />
    )
}

const TestStudyCell: FC = () => {
    return (
        <Text size="sm" c="gray.7">
            Test Study
        </Text>
    )
}

// A test study has no agreement, so it never carries a date. Shared by the two tables that list one.
export const testStudyDateCell = (row: { isTestStudy: boolean }) => (row.isTestStudy ? <TestStudyCell /> : null)
