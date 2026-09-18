import {
    type ButtonProps,
    type ButtonVariant,
    createTheme,
    CSSVariablesResolver,
    defaultVariantColorsResolver,
    DefaultMantineColor,
    DefaultMantineSize,
    Input,
    MantineColorsTuple,
    type VariantColorsResolver,
} from '@mantine/core'
import { buttonSizeVars, uiThemeComponents } from './components/ui/theme-components'
import { semanticColor, semanticCssVariables, typographyCssVariables } from './theme/tokens'

// Transcribed 1:1 from the "SI UI Component Library" Figma file, collection `color primitive`
// (read from Dev Mode → Variables). Every ramp is exactly ten shades indexed 0-9 — Figma defines
// no 950 step and no 50-900 naming. Do not add an eleventh entry: Mantine will happily emit
// --mantine-color-<name>-10 for it, and call sites start depending on a shade design never shipped.

const navy: MantineColorsTuple = [
    '#e6e9ef',
    '#ccd3df',
    '#99a6bf',
    '#677a9e',
    '#344d7e',
    '#01215e',
    '#011a4b',
    '#011438',
    '#000d26',
    '#000713',
]
const turquoise: MantineColorsTuple = [
    '#e6fafa',
    '#ccf6f5',
    '#99eceb',
    '#66e3e1',
    '#33d9d7',
    '#00d0cd',
    '#00a6a4',
    '#007d7b',
    '#005352',
    '#002a29',
]
const red: MantineColorsTuple = [
    '#fbeceb',
    '#f6d8d6',
    '#edb1ad',
    '#e48a84',
    '#db635b',
    '#d23c32',
    '#a83028',
    '#7e241e',
    '#541814',
    '#2a0c0a',
]
const green: MantineColorsTuple = [
    '#ecf4ee',
    '#d9e9dc',
    '#b3d4ba',
    '#8ebe97',
    '#68a975',
    '#429352',
    '#357642',
    '#285831',
    '#1a3b21',
    '#0d1d10',
]
const yellow: MantineColorsTuple = [
    '#fffae7',
    '#fbeed8',
    '#f7ddb1',
    '#f4cd89',
    '#f0bc62',
    '#ecab3b',
    '#bd892f',
    '#8e6723',
    '#5e4418',
    '#2f220c',
]
const blue: MantineColorsTuple = [
    '#e7f1fe',
    '#bddcff',
    '#94c6ff',
    '#6bb0ff',
    '#3d98ff',
    '#1482ff',
    '#006deb',
    '#0058bd',
    '#004594',
    '#00326b',
]
const purple: MantineColorsTuple = [
    '#eae8fc',
    '#d5d2f9',
    '#a7a0f3',
    '#7d73ed',
    '#4f42e6',
    '#291bc4',
    '#2317ab',
    '#19107a',
    '#100a4c',
    '#070524',
]
const grey: MantineColorsTuple = [
    '#f1f3f5',
    '#dadee1',
    '#c4c9cf',
    '#aab3bb',
    '#949ea9',
    '#7a8794',
    '#64707c',
    '#525c66',
    '#3d454c',
    '#2b3036',
]
const charcoal: MantineColorsTuple = [
    '#f8f9fa',
    '#d9d9d9',
    '#bfbfbf',
    '#a6a6a6',
    '#8c8c8c',
    '#737373',
    '#595959',
    '#404040',
    '#262626',
    '#0d0d0d',
]

type ExtendedCustomColors =
    | 'navy'
    | 'turquoise'
    | 'red'
    | 'green'
    | 'yellow'
    | 'blue'
    | 'purple'
    | 'grey'
    | 'charcoal'
    | DefaultMantineColor

type ExtendedCustomSpacing = 'xxs' | 'xxl' | DefaultMantineSize

declare module '@mantine/core' {
    export interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>
    }

    export interface MantineThemeSizesOverride {
        spacing: Record<ExtendedCustomSpacing, string>
    }

    export interface ButtonProps {
        variant?: ButtonVariant | 'error'
    }
}

const variantColorResolver: VariantColorsResolver = (input) => {
    if (input.variant === 'error') {
        return {
            background: 'var(--mantine-color-error-filled)',
            hover: 'var(--mantine-color-error)',
            color: 'var(--mantine-color-white)',
            border: 'none',
        }
    }
    return defaultVariantColorsResolver(input)
}

// Figma collection `font-family`.
const fontFamilySans = '"Open Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const fontFamilyMono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

// Variants Mantine resolves to var(--mantine-color-<c>-light-hover) rather than a shade of the colour
// itself, so each needs brand/Light supplied explicitly.
const LIGHT_HOVER_VARIANTS: readonly ButtonVariant[] = ['outline', 'subtle', 'light']

// Mantine's own disabled rule reads these two variables, so overriding them on the button element
// repaints the disabled state without touching disabled inputs, checkboxes or radios. They have to
// travel as custom properties: `vars` reaches the DOM as an inline style, and an inline style cannot
// carry the :disabled pseudo-class a `styles` callback would need.
const DISABLED_VARS: Record<string, string> = {
    // surface/Disabled medium, text/Disabled
    '--mantine-color-disabled': grey[1],
    '--mantine-color-disabled-color': charcoal[6],
}

export const buttonVars = (_theme: unknown, props: ButtonProps): { root: Record<string, string> } => ({
    root: {
        ...DISABLED_VARS,
        ...buttonSizeVars(props.size),
        ...(LIGHT_HOVER_VARIANTS.some((variant) => variant === props.variant) ? { '--button-hover': navy[0] } : {}),
    },
})

export const theme = createTheme({
    fontFamily: fontFamilySans,
    fontFamilyMonospace: fontFamilyMono,
    headings: {
        fontFamily: fontFamilySans,
        // Figma collection `font-weight`: regular 400, semibold 600, bold 700. There is no 500.
        // Per-heading sizes are deliberately not set: the file's "Text styles" frame still carries
        // Carbon-era names and 140%/165% line heights that contradict the `line-height` collection
        // (1.2/1.35/1.5), so there is no composed heading style to transcribe. See OTTER-661.
        fontWeight: '700',
    },
    // Figma collection `font-size` supplies 10 12 14 16 18 20 22 26 34 40. Five of those line up
    // with Mantine's xs-xl scale, which is what existing call sites pass; the rest reach components
    // as --si-font-size-* rather than being bolted onto Mantine keys design never named.
    fontSizes: {
        xs: '0.75rem',
        sm: '0.875rem',
        md: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
    },
    variantColorResolver,
    colors: {
        navy,
        turquoise,
        red,
        green,
        yellow,
        blue,
        purple,
        grey,
        charcoal,
    },
    components: {
        // uiThemeComponents carries the Figma-transcribed Alert/TextInput overrides; it is spread
        // first so the app-specific entries below win on any shared key.
        ...uiThemeComponents,
        // Figma status/error/text-icon, on the asterisk alone: --mantine-color-error also paints
        // error messages and invalid-input borders. Reaches every Input.Wrapper asterisk, and
        // Radio.Group's, because Input.Label registers its styles under the InputWrapper name.
        InputWrapper: Input.Wrapper.extend({
            styles: { required: { color: red[7] } },
        }),
        Table: {
            styles: () => ({
                th: {
                    backgroundColor: semanticColor('surface.tableheader'),
                },
            }),
        },
        // Mantine defaults `resize` to none, so every multi-line field needs the handle turned on
        // one by one. Set here instead, so a Textarea added later inherits it (OTTER-787).
        Textarea: {
            defaultProps: {
                resize: 'vertical',
            },
        },
        // Button geometry comes from buttonSizeVars, its colours from OTTER-761's buttonVars — one
        // `vars` function, because Mantine only calls one per component.
        Button: {
            defaultProps: {
                radius: 'xs',
            },
            vars: buttonVars,
        },
    },
    // brand/default is navy/5 and brand/hover navy/6, so primaryShade 5 makes Mantine resolve the
    // filled variant and its hover straight off the brand ramp.
    primaryShade: 5,
    primaryColor: 'navy',
    // Figma collection `Brand` > Spacing and Corner-radius.
    spacing: {
        xxs: '0.25rem',
        xs: '0.5rem',
        sm: '0.75rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        xxl: '2.5rem',
    },
    radius: {
        xs: '0.125rem',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '1rem',
        xl: '2rem',
    },
    // Figma collection `Brand` > Shadow, composed from its blur/spread/position/opacity variables.
    // The file defines no shadow colour, so these compose over black. Note xs blur (3) is larger
    // than sm (2) in Figma itself — transcribed faithfully, flagged for design.
    shadows: {
        xs: '0 1px 3px rgba(0, 0, 0, 0.05)',
        sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
        md: '0 4px 6px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.15)',
        xl: '0 20px 25px rgba(0, 0, 0, 0.2)',
    },
})

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
    // Every --si-* variable comes from src/theme/tokens.ts, which is also what components read
    // through semanticColor(). One definition, two consumers.
    variables: { ...semanticCssVariables(theme), ...typographyCssVariables },
    dark: {},
    light: {},
})
