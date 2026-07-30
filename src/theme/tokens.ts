import type { MantineTheme } from '@mantine/core'

// Semantic color tokens, from the "Interim design tokens - handoff - Jul 2026" DTCG file.
//
// Unlike the earlier Figma semantic layer (which was a documentation diagram whose values still
// pointed at a stale palette), these bindings are NOT inferred: the handoff file states each one
// explicitly as a reference to a color primitive, e.g. `text/Header -> {color primitive.Navy.500}`.
// The ramp positions below are those references, mapped onto Mantine's 0-9 indexing (50 = 0).
//
// Components reference these tokens, never raw shades, so a retint happens in one place.

type ShadeRef = `${string}.${number}`

/** Semantic token -> ramp position. The single source of truth for what each role means. */
export const semanticShades = {
    /** text/Body+ Label */
    'text.primary': 'charcoal.9',
    /** text/Sub-labels + Description */
    'text.secondary': 'charcoal.7',
    /** text/Header */
    'text.header': 'navy.5',
    /** text/Placeholder */
    'text.placeholder': 'grey.7',
    /** text/Disabled */
    'text.disabled': 'charcoal.6',

    /** brand/Default */
    'brand.default': 'purple.5',
    /** brand/Hover */
    'brand.hover': 'purple.7',
    /** brand/Secondary */
    'brand.secondary': 'purple.3',
    /** brand/Light */
    'brand.light': 'purple.0',

    /** link/Default */
    'link.default': 'blue.7',
    /** link/Hover */
    'link.hover': 'blue.9',

    /** status/error/text-icon */
    'error.default': 'red.9',
    /** status/error/border + bg-dark */
    'error.hover': 'red.8',
    /** status/success/text-icon */
    'success.default': 'green.9',
    /** status/success/border + bg-dark */
    'success.hover': 'green.8',
    /** status/warning/text-icon */
    'warning.default': 'yellow.9',
    /** status/warning/border */
    'warning.hover': 'yellow.8',
    /** status/info/text-icon */
    'info.default': 'blue.8',
    /** status/info/border + bg-dark */
    'info.hover': 'blue.7',

    /** status bg-light — the pale fills those text/border colors sit on. */
    'error.bg': 'red.0',
    'success.bg': 'green.0',
    'warning.bg': 'yellow.0',
    'info.bg': 'blue.0',

    /** surface/State/Disabled light (input fields) */
    'state.disabled.light': 'grey.0',
    /** surface/State/Disabled medium (buttons) */
    'state.disabled.medium': 'grey.1',
    /** surface/State/Disabled dark */
    'state.disabled.dark': 'grey.3',
    /** surface/State/Selected */
    'state.selected': 'blue.7',

    /** surface/Background/page — the app canvas. */
    'surface.canvas': 'grey.0',
    /** surface/Background/sunken + table header */
    'surface.sunken': 'charcoal.0',
    /** surface/Background/sidenav */
    'surface.sidenav': 'purple.8',
    /** surface/Background/sidenav dp */
    'surface.sidenav.dp': 'purple.6',
    /** surface/Background/Sidenav rl */
    'surface.sidenav.rl': 'green.8',
    /** surface/Miscellaneous/Footer */
    'surface.footer': 'purple.9',

    /** border/Default */
    'border.default': 'charcoal.1',
    /** border/Dark */
    'border.dark': 'grey.4',

    /** icon/light-default */
    'icon.light': 'charcoal.4',
    /** icon/light-hover */
    'icon.light.hover': 'charcoal.5',
    /** icon/dark-default */
    'icon.dark': 'charcoal.7',
    /** icon/dark-hover */
    'icon.dark.hover': 'charcoal.8',
} as const satisfies Record<string, ShadeRef>

export type SemanticToken = keyof typeof semanticShades

// Tokens whose values are not a ramp position: the handoff's base colors and its two alpha
// primitives (`Purple/50 50%`, used by brand/Lighter and surface/Background/selected), which
// cannot live in a MantineColorsTuple.
const NON_RAMP = {
    'text.white': '#ffffff',
    'text.black': '#000000',
    'surface.raised': '#ffffff',
    'surface.popover': '#ffffff',
    'brand.lighter': '#eae8fc80',
    'surface.selected': '#eae8fc80',
} as const

/** CSS custom property name for a token, e.g. `--si-color-text-placeholder`. */
export const cssVar = (token: SemanticToken | keyof typeof NON_RAMP) => `--si-color-${token.replace(/\./g, '-')}`

/** `var(--si-color-…)` reference for use in styles. */
export const semanticColor = (token: SemanticToken | keyof typeof NON_RAMP) => `var(${cssVar(token)})`

const resolveShade = (theme: MantineTheme, ref: ShadeRef) => {
    const [family, shade] = ref.split('.')
    return theme.colors[family][Number(shade)]
}

/** Emitted through `cssVariablesResolver` so tokens are reachable from CSS as well as TS. */
export const semanticCssVariables = (theme: MantineTheme): Record<string, string> => {
    const vars: Record<string, string> = {}

    for (const [token, ref] of Object.entries(semanticShades)) {
        vars[cssVar(token as SemanticToken)] = resolveShade(theme, ref)
    }
    for (const [token, value] of Object.entries(NON_RAMP)) {
        vars[cssVar(token as keyof typeof NON_RAMP)] = value
    }

    // Mantine built-ins that should follow the semantic layer rather than its own defaults.
    vars['--mantine-color-placeholder'] = resolveShade(theme, semanticShades['text.placeholder'])
    vars['--mantine-color-dimmed'] = resolveShade(theme, semanticShades['text.secondary'])

    return vars
}
