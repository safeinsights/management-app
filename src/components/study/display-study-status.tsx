'use client'

import { StatusLabel } from '@/lib/status-labels'
import { FC } from 'react'
import { StudyPill } from './study-pill'

export const DisplayStudyStatus: FC<{ status: StatusLabel }> = ({ status }) => {
    const { label, tooltip, colors } = status

    return <StudyPill label={label} bg={colors.bg} c={colors.c} tooltip={tooltip} />
}
