import type { MantineTheme } from '@mantine/core'

// Semantic color tokens — Figma: IqiKTkT92Dq9YHn5FjlAKr / 4962:1085 (Color tokens)
//
// The names and usage notes come from Figma; the bindings do not. That frame is a documentation
// diagram, not a swatch matrix — its "tokens" are text labels, and get_variable_defs on it returns
// the pre-Navy palette (#0265dc etc). So each token is bound here by ROLE to the Color Primitives
// ramps (7593:20494). These bindings are our inference and need UX sign-off; the Ladle foundations
// catalog renders them labelled for exactly that review.
//
// Components reference these tokens, never raw shades, so a retint happens in one place.

type ShadeRef = `${string}.${number}`

/** Semantic token -> ramp position. The single source of truth for what each role means. */
export const semanticShades = {
    /** text/body+heading+labels */
    'text.primary': 'gray.9',
    /** text/sub-labels+description */
    'text.secondary': 'gray.5',
    /** text.placeholder */
    'text.placeholder': 'gray.7',
    /** text/disabled */
    'text.disabled': 'gray.4',

    /** brand/default- (use for text, icon, stroke, fill) */
    'brand.default': 'navy.5',
    /** brand/hover- (use for text, icon, stroke, fill) */
    'brand.hover': 'navy.7',
    /** brand/secondary- (use for icon, stroke, fill) */
    'brand.secondary': 'violet.5',
    /** brand/light (use for profile icon bg, secondary button-hover) */
    'brand.light': 'navy.0',

    /** link/default-Text, Icon */
    'link.default': 'navy.5',
    /** link/hover-Text, Icon */
    'link.hover': 'navy.7',

    /** error/default- (use for text, icon, stroke, fill) */
    'error.default': 'red.5',
    /** error/hover- (use for text, icon, stroke, fill) */
    'error.hover': 'red.7',
    /** success/default- (use for text, icon, stroke, fill) */
    'success.default': 'green.5',
    /** success/hover- (use for text, icon, stroke, fill) */
    'success.hover': 'green.7',
    /** Text / Warning */
    'warning.default': 'gold.5',

    /** state/disabled/light (use for input fields) */
    'state.disabled.light': 'gray.1',
    /** state/disabled/medium (use for buttons) */
    'state.disabled.medium': 'gray.3',
    /** state/disabled-dark */
    'state.disabled.dark': 'gray.5',

    /** The app canvas. Figma's Gray ramp is exactly 10 shades, so the old out-of-contract
     *  grey[10] (#F1F3F5) lands on gray.0 (#F3F8FB) — the nearest real shade. */
    'surface.canvas': 'gray.0',
} as const satisfies Record<string, ShadeRef>

export type SemanticToken = keyof typeof semanticShades

const NON_RAMP = {
    'text.white': '#FFFFFF',
    'text.black': '#000000',
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
