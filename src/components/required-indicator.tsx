import { type FC } from 'react'
import { Text, type TextProps } from '@mantine/core'

type RequiredIndicatorProps = {
    isVisible?: boolean
    fz?: TextProps['fz']
    fw?: TextProps['fw']
}

export const RequiredIndicator: FC<RequiredIndicatorProps> = ({ isVisible = true, fz, fw }) => {
    if (!isVisible) return null
    return (
        <Text span c="red.9" fz={fz} fw={fw} ml={4} aria-label="required">
            *
        </Text>
    )
}
