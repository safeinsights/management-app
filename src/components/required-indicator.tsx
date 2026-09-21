import { semanticColor } from '@/theme/tokens'
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
        <Text span c={semanticColor('error.text')} fz={fz} fw={fw} ml="xxs" aria-label="required">
            *
        </Text>
    )
}
