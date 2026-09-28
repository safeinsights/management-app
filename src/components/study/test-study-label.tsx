'use client'

import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { type FC } from 'react'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { Badge, Text } from '@mantine/core'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { InfoTooltip } from '../tooltip'

const LABEL = 'Test study'
const TOOLTIP = `A test study does not have ${legalDocumentCollectionLabels.SLA}.`

export const TestStudyLabel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <InfoTooltip label={TOOLTIP} multiline maw={250}>
            <Badge
                variant="outline"
                color="grey.5"
                c={semanticColor('text.secondary')}
                tt="none"
                fw={fontWeight.semibold}
                leftSection={<InfoIcon size={10} weight="fill" aria-hidden />}
            >
                {LABEL}
            </Badge>
        </InfoTooltip>
    )
}

const TestStudyCell: FC = () => {
    return (
        <Text size="sm" c="gray.7">
            {LABEL}
        </Text>
    )
}

// A test study has no agreement, so it never carries a date. Shared by the two tables that list one.
export const testStudyDateCell = (row: { isTestStudy: boolean }) => (row.isTestStudy ? <TestStudyCell /> : null)
