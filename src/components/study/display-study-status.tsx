'use client'

import { StatusLabel } from '@/lib/status-labels'
import { Badge } from '@mantine/core'
import { FC } from 'react'
import { fontWeight } from '@/theme/tokens'
import { InfoTooltip } from '../tooltip'

export const DisplayStudyStatus: FC<{ status: StatusLabel }> = ({ status }) => {
    const { label, tooltip, colors } = status
    const badge = (
        <Badge size="lg" bg={colors.bg} c={colors.c} tt="none" fz="xs" fw={fontWeight.semibold}>
            {label}
        </Badge>
    )

    if (!tooltip) return badge

    return (
        <InfoTooltip label={tooltip} multiline maw={250}>
            {badge}
        </InfoTooltip>
    )
}
