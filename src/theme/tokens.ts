import type { MantineTheme } from '@mantine/core'

// Semantic colour tokens, transcribed 1:1 from the "SI UI Component Library" Figma file,
// collection `semantic tokens` (52 variables, read from Dev Mode → Variables). Each entry below is
// the reference Figma states, e.g. `brand/default -> navy/5`. Nothing here is inferred, and nothing
// is carried over that Figma does not define.
//
// Components reference these roles, never raw shades, so a retint happens in one place.

type ShadeRef = `${string}.${number}`

/** Figma `color primitive` > light blue — the only standalone colour outside the ramps. */
export const LIGHT_BLUE = '#f3f8fb'

/** Semantic token -> ramp position. The single source of truth for what each role means. */
export const semanticShades = {
    /** text/Header */
    'text.header': 'navy.5',
    /** text/Body+ Label */
    'text.primary': 'charcoal.9',
    /** text/Sub-labels + Description */
    'text.secondary': 'charcoal.7',
    /** text/Placeholder */
    'text.placeholder': 'charcoal.6',
    /** text/Disabled */
    'text.disabled': 'charcoal.6',

    /** brand/default */
    'brand.default': 'navy.5',
    /** brand/hover */
    'brand.hover': 'navy.6',
    /** brand/light */
    'brand.light': 'navy.0',
    /** brand/secondary */
    'brand.secondary': 'navy.2',
    /** brand/accent */
    'brand.accent': 'turquoise.5',

    /** surface/page */
    'surface.page': 'grey.0',
    /** surface/sunken */
    'surface.sunken': 'charcoal.0',
    /** surface/hover */
    'surface.hover': 'charcoal.0',
    /** surface/selected */
    'surface.selected': 'blue.7',
    /** surface/Disabled dark */
    'surface.disabled.dark': 'grey.3',
    /** surface/Disabled medium */
    'surface.disabled.medium': 'grey.1',
    /** surface/sidenav */
    'surface.sidenav': 'navy.7',
    /** surface/sidenav dp */
    'surface.sidenav.dp': 'purple.6',
    /** surface/Sidenav rl */
    'surface.sidenav.rl': 'green.6',
    /** surface/sidenavhover */
    'surface.sidenav.hover': 'turquoise.0',
    /** surface/Footer */
    'surface.footer': 'purple.9',

    /** border/Default */
    'border.default': 'charcoal.1',
    /** border/Dark */
    'border.dark': 'charcoal.2',

    /** icon/light-default */
    'icon.light': 'charcoal.4',
    /** icon/light-hover */
    'icon.light.hover': 'charcoal.5',
    /** icon/dark-default */
    'icon.dark': 'charcoal.7',
    /** icon/dark-hover */
    'icon.dark.hover': 'charcoal.8',

    /** status/success/* */
    'success.text': 'green.7',
    'success.border': 'green.6',
    'success.bg.light': 'green.0',
    'success.bg.dark': 'green.6',
    /** status/warning/* */
    'warning.text': 'yellow.8',
    'warning.border': 'yellow.6',
    'warning.bg.light': 'yellow.0',
    'warning.bg.dark': 'yellow.5',
    /** status/error/* */
    'error.text': 'red.7',
    'error.border': 'red.6',
    'error.bg.light': 'red.0',
    'error.bg.dark': 'red.6',
    /** status/info/* */
    'info.text': 'blue.8',
    'info.border': 'blue.6',
    'info.bg.light': 'blue.0',
    'info.bg.dark': 'blue.6',

    /** link/Default */
    'link.default': 'blue.7',
    /** link/Hover */
    'link.hover': 'blue.8',
} as const satisfies Record<string, ShadeRef>

export type SemanticToken = keyof typeof semanticShades

// Tokens whose value is not a ramp position: Figma's two base colours, its `light blue`, and the
// two alpha entries (`surface/tableheader` = #DADEE1 50%, `brand/accentalpha` = alpha/Blue30,
// itself #E7F1FE 30%) — none of which can live in a MantineColorsTuple.
const NON_RAMP = {
    'text.white': '#ffffff',
    'text.black': '#000000',
    'surface.raised': '#ffffff',
    'surface.popover': '#ffffff',
    'surface.topnav': LIGHT_BLUE,
    'surface.tableheader': '#dadee180',
    'brand.accentalpha': '#e7f1fe4d',
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
    vars['--mantine-color-error'] = resolveShade(theme, semanticShades['error.text'])
    vars['--mantine-color-error-filled'] = resolveShade(theme, semanticShades['error.bg.dark'])

    return vars
}

// Figma collections `font-size` and `line-height`. The five sizes that coincide with Mantine's
// xs-xl scale are set on the theme itself; these expose the whole set, including the sizes Mantine
// has no key for, without inventing names for them.
export const typographyCssVariables: Record<string, string> = {
    '--si-font-size-10': '0.625rem',
    '--si-font-size-12': '0.75rem',
    '--si-font-size-14': '0.875rem',
    '--si-font-size-16': '1rem',
    '--si-font-size-18': '1.125rem',
    '--si-font-size-20': '1.25rem',
    '--si-font-size-22': '1.375rem',
    '--si-font-size-26': '1.625rem',
    '--si-font-size-34': '2.125rem',
    '--si-font-size-40': '2.5rem',

    '--si-font-weight-regular': '400',
    '--si-font-weight-semibold': '600',
    '--si-font-weight-bold': '700',

    '--si-line-height-tight': '1.2',
    '--si-line-height-heading': '1.35',
    '--si-line-height-normal': '1.5',
}

// Mantine has no font-weight scale, so `fw` had no token to reach for. These name the three
// weights Figma defines.
export const fontWeight = {
    regular: 'var(--si-font-weight-regular)',
    semibold: 'var(--si-font-weight-semibold)',
    bold: 'var(--si-font-weight-bold)',
} as const
