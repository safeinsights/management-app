'use client'

import { StatusLabel } from '@/lib/status-labels'
import { Badge } from '@mantine/core'
import { FC } from 'react'
import { InfoTooltip } from '../tooltip'

export const DisplayStudyStatus: FC<{ status: StatusLabel }> = ({ status }) => {
    const { label, tooltip, colors } = status
    const badge = (
        // lg gives Figma's 26px height and 12px padding, but its label is 13px with 0.25px letter-spacing.
        // label/sm is 12px with no letter-spacing.
        <Badge size="lg" fz="xs" lts={0} bg={colors.bg} c={colors.c}>
            {label}
        </Badge>
    )

    if (!tooltip) return badge

    return <InfoTooltip label={tooltip}>{badge}</InfoTooltip>
}
