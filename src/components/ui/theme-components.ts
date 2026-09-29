import { Alert, type MantineThemeComponents } from '@mantine/core'
import { semanticColor } from '@/theme/tokens'

// Per-component theme overrides. Geometry is transcribed from the Figma component pages
// (Button 4216:2, Alert 61:5826); colors are NOT taken from those pages — they are still drawn
// on a stale palette — and are mapped by ROLE through the semantic tokens instead.

/** Button sizes — Figma 4216:2. Height/padding/font-size per size, radius xs on every variant. */
const BUTTON_SIZES = {
    xs: { height: 30, padding: 14, fontSize: 12 },
    sm: { height: 36, padding: 18, fontSize: 14 },
    md: { height: 42, padding: 22, fontSize: 16 },
    lg: { height: 50, padding: 26, fontSize: 18 },
    xl: { height: 60, padding: 32, fontSize: 20 },
} as const

// Composed into `buttonVars` in src/theme.ts rather than carried on a Button entry here, because
// Mantine calls a single `vars` per component and OTTER-761's colour vars own that slot.
export const buttonSizeVars = (size: string | number | undefined) => {
    const spec = BUTTON_SIZES[size as keyof typeof BUTTON_SIZES] ?? BUTTON_SIZES.md

    return {
        '--button-height': `${spec.height}px`,
        '--button-padding-x': `${spec.padding}px`,
        '--button-fz': `${spec.fontSize}px`,
    }
}

export const uiThemeComponents: MantineThemeComponents = {
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
            color: semanticColor('text.primary'),
        },
        styles: () => ({
            input: { '::placeholder': { color: semanticColor('text.placeholder') } },
        }),
    },
}
