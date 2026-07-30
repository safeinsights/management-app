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

// Typography — "Interim design tokens - handoff - Jul 2026", Typography-styles group.
//
// `size` mirrors the handoff's composed style names exactly (heading display/page/page-sm/card,
// body lg/md/sm, …) so a reviewer can hold the token file and the catalog side by side with
// nothing to translate.
//
// Mantine's own `size`/`order` props are deliberately omitted: Mantine's `TitleSize` already
// spells h1-h6 and its `Text` size runs xs-xl, so leaving them exposed would give one prop two
// meanings. Everything else on Title/Text passes through.

const HEADING_ORDER = {
    display: 1,
    page: 1,
    'page-sm': 2,
    card: 3,
    minor: 4,
} as const satisfies Record<string, TitleProps['order']>

export type HeadingSize = keyof typeof HEADING_ORDER
export type TextSize = 'body-lg' | 'body-md' | 'body-sm' | 'label-md' | 'label-sm' | 'description'

// Font weight is part of the handoff's composed styles but is not carried by `fz`/`lh`, so it is
// applied here. Body and description are regular; labels, eyebrows and links are semibold.
const TEXT_WEIGHT: Partial<Record<TextSize, number>> = {
    'label-md': 600,
    'label-sm': 600,
}

type TypographyExtras = {
    /** Theme shadow token (`xs`-`xl`) applied as a text-shadow. */
    shadow?: MantineShadow
    children?: ReactNode
}

export type HeadingProps = Omit<TitleProps, 'size' | 'order'> &
    TypographyExtras & {
        /** Handoff heading style. @default 'page' */
        size?: HeadingSize
    }

export type TextProps = Omit<MantineTextProps, 'size'> &
    TypographyExtras & {
        /** Handoff body/label style. @default 'body-md' */
        size?: TextSize
    }

const useTextShadow = (shadow?: MantineShadow) => {
    const theme = useMantineTheme()
    if (!shadow) return undefined
    return theme.shadows[shadow as keyof typeof theme.shadows] ?? shadow
}

export const Heading: FC<HeadingProps> = ({ size = 'page', shadow, style, children, ...props }) => {
    const textShadow = useTextShadow(shadow)

    return (
        <Title
            order={HEADING_ORDER[size]}
            fz={size}
            lh={size}
            c={props.c ?? semanticColor('text.header')}
            style={{ textShadow, ...style }}
            {...props}
        >
            {children}
        </Title>
    )
}

export const Text: FC<TextProps> = ({ size = 'body-md', shadow, style, children, ...props }) => {
    const textShadow = useTextShadow(shadow)

    return (
        <MantineText
            fz={size}
            lh={size}
            fw={props.fw ?? TEXT_WEIGHT[size]}
            c={props.c ?? semanticColor('text.primary')}
            style={{ textShadow, ...style }}
            {...props}
        >
            {children}
        </MantineText>
    )
}
