import {
    createTheme,
    CSSVariablesResolver,
    DefaultMantineColor,
    DefaultMantineSize,
    MantineColorsTuple,
} from '@mantine/core'
import type { HeadingSize, TextSize } from './components/ui/typography'
import { uiThemeComponents } from './components/ui/theme-components'
import { semanticCssVariables } from './theme/tokens'

// Generated from "Interim design tokens - handoff - Jul 2026" (W3C DTCG).
// Ramps map 50..900 onto Mantine index 0..9. Grey/Purple carry an extra 950
// step, kept in slot 10 and referenced via the semantic tokens below.

const red: MantineColorsTuple = [
    '#ffe0e0',
    '#ffcccc',
    '#ffadad',
    '#ff8a8a',
    '#ff6b6b',
    '#ff4747',
    '#ff2929',
    '#ff0505',
    '#a83028',
    '#7e241e',
]
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
    '#212529',
]
const green: MantineColorsTuple = [
    '#e8f8eb',
    '#d8f3dd',
    '#c1ecc9',
    '#a6e3b2',
    '#8edc9e',
    '#77d58a',
    '#5ccc72',
    '#44c55e',
    '#357642',
    '#285831',
]
const yellow: MantineColorsTuple = [
    '#fff9e5',
    '#fff6db',
    '#fff0c2',
    '#ffe9a8',
    '#ffe38f',
    '#ffdd75',
    '#ffd65c',
    '#ffd042',
    '#8e6723',
    '#5e4418',
]
const blue: MantineColorsTuple = [
    '#e4f0ff',
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
    '#040212',
]

// The handoff's alpha primitives (Purple/50 50%, Purple/900 75%) cannot live in a Mantine
// tuple; they are defined as non-ramp entries in src/theme/tokens.ts instead.

type ExtendedCustomColors =
    | 'purple'
    | 'blue'
    | 'charcoal'
    | 'grey'
    | 'red'
    | 'green'
    | 'yellow'
    | 'navy'
    | 'turquoise'
    | DefaultMantineColor

type ExtendedCustomSpacing = 'xxs' | 'xxl' | DefaultMantineSize

// The handoff's composed type styles, addressable as font-size/line-height keys so the
// ui/ Heading and Text components can pass their `size` straight through to Mantine's
// `fz`/`lh`. These sit alongside Mantine's xs-xl scale rather than replacing it, because
// existing call sites across the app still use size="sm" etc.
type ExtendedCustomFontSize = HeadingSize | TextSize | DefaultMantineSize

declare module '@mantine/core' {
    export interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>
    }

    export interface MantineThemeSizesOverride {
        spacing: Record<ExtendedCustomSpacing, string>
        fontSizes: Record<ExtendedCustomFontSize, string>
        lineHeights: Record<ExtendedCustomFontSize, string>
    }
}

const fontFamilySans = '"Open Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const fontFamilyMono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

export const theme = createTheme({
    fontFamily: fontFamilySans,
    fontFamilyMonospace: fontFamilyMono,
    headings: {
        fontFamily: fontFamilySans,
        fontWeight: '700',
        sizes: {
            h1: { fontSize: '2.125rem', lineHeight: '1.35' },
            h2: { fontSize: '1.375rem', lineHeight: '1.35' },
            h3: { fontSize: '1.25rem', lineHeight: '1.35' },
            h4: { fontSize: '1rem', lineHeight: '1.35' },
        },
    },
    // Mantine's xs-xl scale (used by existing call sites) plus the handoff's composed
    // type-style names (used by the ui/ Heading and Text components). Both resolve to the
    // same font-size primitives from the token file.
    fontSizes: {
        xs: '0.625rem',
        sm: '0.75rem',
        md: '0.875rem',
        lg: '1rem',
        xl: '1.125rem',

        display: '2.5rem',
        page: '2.125rem',
        'page-sm': '1.375rem',
        card: '1.25rem',
        minor: '1rem',
        'body-lg': '1.125rem',
        'body-md': '1rem',
        'body-sm': '0.875rem',
        'label-md': '0.875rem',
        'label-sm': '0.75rem',
        description: '0.75rem',
    },
    // Only three line-height primitives exist in the handoff (1.2 / 1.35 / 1.5); the
    // composed styles express them as 120% / 135% / 150%, which mean the same thing.
    lineHeights: {
        xs: '1.2',
        sm: '1.2',
        md: '1.5',
        lg: '1.5',
        xl: '1.5',

        display: '1.2',
        page: '1.35',
        'page-sm': '1.35',
        card: '1.35',
        minor: '1.35',
        'body-lg': '1.5',
        'body-md': '1.5',
        'body-sm': '1.5',
        'label-md': '1.2',
        'label-sm': '1.2',
        description: '1.5',
    },
    colors: {
        charcoal,
        grey,
        red,
        green,
        yellow,
        purple,
        blue,
        navy,
        turquoise,
    },
    components: {
        // uiThemeComponents carries the Figma-transcribed Button/Alert/TextInput overrides;
        // it is spread first so the app-specific entries below win on any shared key.
        ...uiThemeComponents,
        Table: {
            styles: () => ({
                th: {
                    // surface/Background/table header
                    backgroundColor: charcoal[0],
                },
            }),
        },
    },
    primaryShade: 5,
    primaryColor: 'purple',
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
    shadows: {
        xs: '0 1px 3px rgba(0, 0, 0, 0.05)',
        sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
        md: '0 4px 6px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.15)',
        xl: '0 20px 25px rgba(0, 0, 0, 0.2)',
    },
})

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
    // Every --si-color-* variable comes from src/theme/tokens.ts, which is also what the ui/
    // components read through semanticColor(). One definition, two consumers.
    variables: semanticCssVariables(theme),
    dark: {},
    light: {},
})
