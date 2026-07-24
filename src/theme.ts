import {
    createTheme,
    CSSVariablesResolver,
    DefaultMantineColor,
    DefaultMantineSize,
    MantineColorsTuple,
} from '@mantine/core'
import { uiThemeComponents } from './components/ui/theme-components'
import { semanticCssVariables } from './theme/tokens'

// Palette — Figma: IqiKTkT92Dq9YHn5FjlAKr / 7593:20494 (Color Primitives)
// 8 families x exactly 10 shades, matching MantineColorsTuple with no interpolation.
// Shade 5 is the brand color in every ramp.

const navy: MantineColorsTuple = [
    '#E6E9EF',
    '#CCD3DF',
    '#99A6BF',
    '#677A9E',
    '#344D7E',
    '#01215E',
    '#011A4B',
    '#011438',
    '#000D26',
    '#000713',
]
const violet: MantineColorsTuple = [
    '#F3EAF4',
    '#E7D4E8',
    '#CFA9D1',
    '#B77FBA',
    '#9F54A3',
    '#87298C',
    '#6C2170',
    '#511954',
    '#361038',
    '#1B081C',
]
const blue: MantineColorsTuple = [
    '#E7EAF5',
    '#CFD6EB',
    '#A0ACD7',
    '#7083C4',
    '#4159B0',
    '#11309C',
    '#0E267D',
    '#0A1D5E',
    '#07133E',
    '#030A1F',
]
const turquoise: MantineColorsTuple = [
    '#E6FAFA',
    '#CCF6F5',
    '#99ECEB',
    '#66E3E1',
    '#33D9D7',
    '#00D0CD',
    '#00A6A4',
    '#007D7B',
    '#005352',
    '#002A29',
]
const green: MantineColorsTuple = [
    '#ECF4EE',
    '#D9E9DC',
    '#B3D4BA',
    '#8EBE97',
    '#68A975',
    '#429352',
    '#357642',
    '#285831',
    '#1A3B21',
    '#0D1D10',
]
const gold: MantineColorsTuple = [
    '#FDF7EB',
    '#FBEED8',
    '#F7DDB1',
    '#F4CD89',
    '#F0BC62',
    '#ECAB3B',
    '#BD892F',
    '#8E6723',
    '#5E4418',
    '#2F220C',
]
const red: MantineColorsTuple = [
    '#FBECEB',
    '#F6D8D6',
    '#EDB1AD',
    '#E48A84',
    '#DB635B',
    '#D23C32',
    '#A83028',
    '#7E241E',
    '#541814',
    '#2A0C0A',
]
const gray: MantineColorsTuple = [
    '#F3F8FB',
    '#E3E9EF',
    '#CFD8E0',
    '#B2BECA',
    '#8B98A6',
    '#6E7C8B',
    '#566777',
    '#3D4A59',
    '#28323D',
    '#161D25',
]

type ExtendedCustomColors =
    | 'navy'
    | 'violet'
    | 'blue'
    | 'turquoise'
    | 'green'
    | 'gold'
    | 'red'
    | 'gray'
    | DefaultMantineColor

type ExtendedCustomSpacing = 'xxs' | 'xxl' | DefaultMantineSize

declare module '@mantine/core' {
    export interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>
    }

    export interface MantineThemeSizesOverride {
        spacing: Record<ExtendedCustomSpacing, string>
    }
}

export const theme = createTheme({
    fontFamily: 'Open Sans',
    headings: {
        fontFamily: 'Open Sans',
        fontWeight: '700',
    },
    colors: {
        navy,
        violet,
        blue,
        turquoise,
        green,
        gold,
        red,
        gray,
    },
    primaryShade: 5,
    primaryColor: 'navy',

    components: uiThemeComponents,

    // Figma: 3223:2493 (Text styles) — Open Sans throughout.
    // Keys mirror the Figma primitive names so the catalog and the file line up.
    fontSizes: {
        h0: '2.5rem', // 40px — page title
        h3: '1.375rem', // 22px — section heading
        h5: '1.25rem', // 20px — body title
        b1: '1.125rem', // 18px — large body
        b2: '1rem', // 16px — body
        b3: '0.875rem', // 14px — small body
        b4: '0.75rem', // 12px — description
        b5: '0.625rem', // 10px — sub-text
    },
    lineHeights: {
        h0: '1.5',
        h3: '1.4',
        h5: '1.65',
        b1: '1.6',
        b2: '1.55',
        b3: '1.55',
        b4: '1.4',
        b5: '1.55',
    },

    // Figma: 5042:214107 (Corner radius primitives)
    radius: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '16px',
        xl: '32px',
    },
    defaultRadius: 'xs',

    // Figma: 4910:360 (Shadow primitives)
    shadows: {
        xs: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.1)',
        md: '0 4px 6px 0 rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px 0 rgba(0, 0, 0, 0.15)',
        xl: '0 20px 25px 0 rgba(0, 0, 0, 0.2)',
    },

    // Figma: 3185:595 (Spacing primitives) — base 16px = 1rem
    spacing: {
        xxs: '0.25rem',
        xs: '0.5rem',
        sm: '0.75rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        xxl: '2.5rem',
    },
})

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
    variables: {
        ...semanticCssVariables(theme),
    },
    dark: {},
    light: {},
})
