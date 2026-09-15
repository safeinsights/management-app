'use client'

import { Flex, Text } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { type FC } from 'react'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { InfoTooltip } from '../tooltip'

export const TEST_STUDY_LABEL = 'Test study'
export const TEST_STUDY_TOOLTIP = `A test study does not have ${legalDocumentCollectionLabels.SLA}.`

type Props = {
    isVisible: boolean
}

export const TestStudyLabel: FC<Props> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <InfoTooltip label={TEST_STUDY_TOOLTIP} multiline styles={{ tooltip: { maxWidth: 250 } }}>
            <Flex
                align="center"
                gap={4}
                bg="blue.0"
                c="blue.9"
                bdrs={100}
                px={12}
                py={2}
                style={{ display: 'inline-flex', whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
                <Text size="xs" fw={500}>
                    {TEST_STUDY_LABEL}
                </Text>
                <InfoIcon size={12} weight="fill" aria-hidden />
            </Flex>
        </InfoTooltip>
    )
}
