import { Alert, Button, type MantineThemeComponents } from '@mantine/core'
import { semanticColor } from '@/theme/tokens'

// Per-component theme overrides — Figma: IqiKTkT92Dq9YHn5FjlAKr
//   Button 4216:2 (ready) · Alert 61:5826 (ready)
//
// Geometry is transcribed from Figma verbatim. Colors are NOT: every component page in the file is
// still built on the pre-Navy palette (#291bc4 purple, #c70000 error), none of which exists in the
// Color Primitives ramps. So each color is mapped by ROLE through the semantic tokens instead.

/** Button sizes — Figma 4216:2. Height/padding/font-size per size, radius 2 on every variant. */
const BUTTON_SIZES = {
    xs: { height: 30, padding: 14, fontSize: 12 },
    sm: { height: 36, padding: 18, fontSize: 14 },
    md: { height: 42, padding: 22, fontSize: 16 },
    lg: { height: 50, padding: 26, fontSize: 18 },
    xl: { height: 60, padding: 32, fontSize: 20 },
} as const

const buttonSizeVars = (size: string) => {
    const spec = BUTTON_SIZES[size as keyof typeof BUTTON_SIZES] ?? BUTTON_SIZES.md

    return {
        '--button-height': `${spec.height}px`,
        '--button-padding-x': `${spec.padding}px`,
        '--button-fz': `${spec.fontSize}px`,
    }
}

export const uiThemeComponents: MantineThemeComponents = {
    Button: Button.extend({
        defaultProps: {
            radius: 'xs',
        },
        vars: (_theme, props) => ({
            root: buttonSizeVars(props.size ?? 'md'),
        }),
        styles: () => ({
            // Figma label weight is 600 across every size; Mantine has no --button-fw var.
            label: { fontWeight: 600 },
        }),
    }),

    Alert: Alert.extend({
        defaultProps: {
            radius: 'xs',
        },
        styles: () => ({
            // Figma: pad 12/16, gap 8 — uniform across all 30 variants.
            root: { padding: '12px 16px' },
            wrapper: { gap: 8 },
            title: { color: 'inherit' },
        }),
    }),

    TextInput: {
        defaultProps: {
            radius: 'xs',
        },
        styles: () => ({
            input: { '::placeholder': { color: semanticColor('text.placeholder') } },
        }),
    },
}
