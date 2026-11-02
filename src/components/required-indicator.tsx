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
    // Inherits the label's size and weight when nested in it; a sibling of the label passes fz/fw.
    return (
        <Text span inherit c={semanticColor('error.text')} fz={fz} fw={fw} ml="xxs" aria-label="required">
            *
        </Text>
    )
}
