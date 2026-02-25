'use client'

import { StatusLabel } from '@/lib/status-labels'
import { Flex, Text } from '@mantine/core'
import { TrophyIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'
import { InfoTooltip } from '../tooltip'

type PillStyle = {
    bg: string
    c: string
}

const STAGE_DISPLAY_NAME: Record<StatusLabel['stage'], string> = {
    Proposal: 'Proposal',
    Code: 'Code',
    Results: 'Result',
}

function getPillStyle(stage: StatusLabel['stage'], label: string): PillStyle {
    if (label === 'Needs Review' && stage !== 'Results') return { bg: 'violet.1', c: 'violet.7' }

    if (label === 'Needs Review' || label === 'Under Review') return { bg: 'yellow.0', c: 'dark.9' }

    if (label === 'Rejected' || label === 'Errored') return { bg: 'red.1', c: 'red.8' }

    if (label === 'Approved' || label === 'Ready') return { bg: 'green.1', c: 'green.8' }

    return { bg: 'gray.1', c: 'dark.5' }
}

export const DisplayStudyStatus: FC<{ status: StatusLabel }> = ({ status }) => {
    const { label, tooltip, stage } = status
    const { bg, c } = getPillStyle(stage, label)
    const stageDisplay = STAGE_DISPLAY_NAME[stage]
    const badgeText = `${stageDisplay} ${label.toLowerCase()}`
    const showResultsIcon = stage === 'Results' && label === 'Ready'

    return (
        <InfoTooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
            <Flex
                align="center"
                gap={4}
                bg={bg}
                c={c}
                bdrs={100}
                px={16}
                py={4}
                style={{ display: 'inline-flex', cursor: 'pointer' }}
            >
                {showResultsIcon && <TrophyIcon size={12} weight="fill" />}
                <Text size="xs" fw={500}>
                    {badgeText}
                </Text>
            </Flex>
        </InfoTooltip>
    )
}
