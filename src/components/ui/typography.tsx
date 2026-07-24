import {
    MantineShadow,
    Text as MantineText,
    TextProps as MantineTextProps,
    Title,
    TitleProps,
    useMantineTheme,
} from '@mantine/core'
import { FC, ReactNode } from 'react'
import { semanticColor } from '@/theme/tokens'

// Typography — Figma: IqiKTkT92Dq9YHn5FjlAKr / 3223:2493 (Text styles), 3185:1448 (Text primitives)
//
// `size` mirrors the Figma primitive names exactly (h0/h3/h5, b1-b5) so a reviewer can hold the
// Figma file and the catalog side by side with nothing to translate. The gaps are real: Figma
// defines h0, h3 and h5 only — there is no h1/h2/h4.
//
// Mantine's own `size`/`order` props are deliberately omitted. Mantine's `TitleSize` already spells
// `h1`-`h6` and its `Text` size runs xs-xl, so leaving them exposed would give one prop two
// meanings. Everything else on Title/Text passes through.

const HEADING_ORDER = {
    h0: 1,
    h3: 3,
    h5: 5,
} as const satisfies Record<string, TitleProps['order']>

export type HeadingSize = keyof typeof HEADING_ORDER
export type TextSize = 'b1' | 'b2' | 'b3' | 'b4' | 'b5'

type TypographyExtras = {
    /** Theme shadow token (`xs`-`xl`) applied as a text-shadow. */
    shadow?: MantineShadow
    children?: ReactNode
}

export type HeadingProps = Omit<TitleProps, 'size' | 'order'> &
    TypographyExtras & {
        /** Figma heading primitive. Figma defines h0, h3 and h5 only. @default 'h0' */
        size?: HeadingSize
    }

export type TextProps = Omit<MantineTextProps, 'size'> &
    TypographyExtras & {
        /** Figma body primitive. @default 'b2' */
        size?: TextSize
    }

const useTextShadow = (shadow?: MantineShadow) => {
    const theme = useMantineTheme()
    if (!shadow) return undefined
    return theme.shadows[shadow as keyof typeof theme.shadows] ?? shadow
}

export const Heading: FC<HeadingProps> = ({ size = 'h0', shadow, style, children, ...props }) => {
    const textShadow = useTextShadow(shadow)

    return (
        <Title
            order={HEADING_ORDER[size]}
            fz={size}
            lh={size}
            c={props.c ?? semanticColor('text.primary')}
            style={{ textShadow, ...style }}
            {...props}
        >
            {children}
        </Title>
    )
}

export const Text: FC<TextProps> = ({ size = 'b2', shadow, style, children, ...props }) => {
    const textShadow = useTextShadow(shadow)

    return (
        <MantineText
            fz={size}
            lh={size}
            c={props.c ?? semanticColor('text.primary')}
            style={{ textShadow, ...style }}
            {...props}
        >
            {children}
        </MantineText>
    )
}
