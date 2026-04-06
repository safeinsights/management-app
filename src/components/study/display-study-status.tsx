'use client'

import { StatusLabel } from '@/lib/status-labels'
import { Flex, Text } from '@mantine/core'
import { TrophyIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'
import { InfoTooltip } from '../tooltip'

const STAGE_DISPLAY_NAME: Record<StatusLabel['stage'], string> = {
    Proposal: 'Proposal',
    Code: 'Code',
    Results: 'Result',
}

export const DisplayStudyStatus: FC<{ status: StatusLabel }> = ({ status }) => {
    const { label, tooltip, stage, colors } = status
    const { bg, c } = colors
    const stageDisplay = STAGE_DISPLAY_NAME[stage]
    const badgeText = `${stageDisplay} ${label.toLowerCase()}`
    const showResultsIcon = stage === 'Results' && label === 'Ready'

    const pill = (
        <Flex
            align="center"
            gap={4}
            bg={bg}
            c={c}
            bdrs={100}
            px={16}
            py={4}
            style={{ display: 'inline-flex', whiteSpace: 'nowrap', cursor: tooltip ? 'pointer' : 'default' }}
        >
            {showResultsIcon && <TrophyIcon size={12} weight="fill" />}
            <Text size="xs" fw={500}>
                {badgeText}
            </Text>
        </Flex>
    )

    if (!tooltip) return pill

    return (
        <InfoTooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
            {pill}
        </InfoTooltip>
    )
}
