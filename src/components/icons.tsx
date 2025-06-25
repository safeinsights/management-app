'use client'

import { InfoIcon as SVGIcon } from '@phosphor-icons/react/dist/ssr'
import { ActionIcon, ActionIconProps, useMantineTheme } from '@mantine/core'

type InfoIconProps = ActionIconProps & {
    size?: number
    innerRef?: React.ForwardedRef<HTMLButtonElement>
}

export const InfoIcon: React.FC<InfoIconProps> = ({ innerRef, size, ...iconProps }) => {
    const {
        colors: { blue },
    } = useMantineTheme()

    return (
        <ActionIcon variant="transparent" {...iconProps} ref={innerRef}>
            <SVGIcon color={blue[7]} weight="fill" size={size} />
        </ActionIcon>
    )
}
