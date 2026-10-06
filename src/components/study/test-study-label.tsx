'use client'

import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { type FC } from 'react'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { Badge, HoverCard, Text } from '@mantine/core'

const LABEL = 'Test study'
const NOTE = `A test study does not have ${legalDocumentCollectionLabels.SLA}.`

export const TestStudyLabel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <HoverCard width={280} withArrow shadow="md" position="bottom-start">
            <HoverCard.Target>
                <Badge variant="outline" color="grey.5" leftSection={<InfoIcon size={10} weight="fill" aria-hidden />}>
                    {LABEL}
                </Badge>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Text size="sm">{NOTE}</Text>
            </HoverCard.Dropdown>
        </HoverCard>
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
