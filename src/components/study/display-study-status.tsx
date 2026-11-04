'use client'

import { StatusLabel } from '@/lib/status-labels'
import { Badge } from '@mantine/core'
import { FC } from 'react'
import { InfoTooltip } from '../tooltip'

export const DisplayStudyStatus: FC<{ status: StatusLabel }> = ({ status }) => {
    const { label, tooltip, colors } = status
    const badge = (
        // lg gives Figma's 26px height and 12px padding, but its 13px label is not label/sm (12px).
        <Badge size="lg" fz="xs" bg={colors.bg} c={colors.c}>
            {label}
        </Badge>
    )

    if (!tooltip) return badge

    return <InfoTooltip label={tooltip}>{badge}</InfoTooltip>
}
