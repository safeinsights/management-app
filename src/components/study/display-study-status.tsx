'use client'

import { StatusLabel } from '@/lib/status-labels'
import { TrophyIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'
import { StudyPill } from './study-pill'

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

    return (
        <StudyPill
            label={badgeText}
            bg={bg}
            c={c}
            tooltip={tooltip}
            icon={showResultsIcon ? <TrophyIcon size={12} weight="fill" /> : undefined}
        />
    )
}
