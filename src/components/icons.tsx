'use client'

import { InfoIcon as SVGIcon } from '@phosphor-icons/react/dist/ssr'
import { ActionIcon, ActionIconProps, useMantineTheme } from '@mantine/core'
import { forwardRef } from 'react'

type InfoIconProps = ActionIconProps & {
    size?: number
}

export const InfoIcon = forwardRef<HTMLButtonElement, InfoIconProps>(({ size, ...iconProps }, ref) => {
    const {
        colors: { blue },
    } = useMantineTheme()

    return (
        <ActionIcon variant="transparent" {...iconProps} ref={ref} aria-label="More information">
            <SVGIcon color={blue[7]} weight="fill" size={size} />
        </ActionIcon>
    )
})
InfoIcon.displayName = 'InfoIcon'
