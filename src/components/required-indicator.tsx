import { type FC } from 'react'
import { Text, type TextProps } from '@mantine/core'

type RequiredIndicatorProps = {
    /** When false the indicator renders nothing; lets callers pass a boolean directly instead of wrapping in `{cond && ...}`. */
    isVisible?: boolean
    /** Override font sizing/weight when sitting next to a section heading. Defaults match Mantine's small inline-label asterisk. */
    fz?: TextProps['fz']
    fw?: TextProps['fw']
}

/**
 * Visual asterisk that marks a required field or section, with `aria-label="required"`
 * so screen readers announce "required" instead of "asterisk".
 */
export const RequiredIndicator: FC<RequiredIndicatorProps> = ({ isVisible = true, fz, fw }) => {
    if (!isVisible) return null
    return (
        <Text span c="red.9" fz={fz} fw={fw} ml={4} aria-label="required">
            *
        </Text>
    )
}
