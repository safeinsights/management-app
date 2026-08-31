import {
    createTheme,
    CSSVariablesResolver,
    DefaultMantineColor,
    DefaultMantineSize,
    MantineColorsTuple,
} from '@mantine/core'

const charcoal: MantineColorsTuple = [
    '#E6E6E6',
    '#D9D9D9',
    '#BFBFBF',
    '#A6A6A6',
    '#8C8C8C',
    '#737373',
    '#595959',
    '#404040',
    '#262626',
    '#0D0D0D',
]
const grey: MantineColorsTuple = [
    '#E6E8EB',
    '#DADEE1',
    '#C4C9CF',
    '#AAB3BB',
    '#949EA9',
    '#7A8794',
    '#64707C',
    '#525C66',
    '#3D454C',
    '#2B3036',
    '#F1F3F5',
]
const red: MantineColorsTuple = [
    '#FFE0E0',
    '#FFCCCC',
    '#FFADAD',
    '#FF8A8A',
    '#FF6B6B',
    '#FF4747',
    '#FF2929',
    '#FF0505',
    '#E60000',
    '#C70000',
    '#7E241E',
]
const green: MantineColorsTuple = [
    '#E8F8EB',
    '#D8F3DD',
    '#C1ECC9',
    '#A6E3B2',
    '#8EDC9E',
    '#77D58A',
    '#5CCC72',
    '#44C55E',
    '#37AF4F',
    '#2F9844',
    '#2B8A3E',
]
const yellow: MantineColorsTuple = [
    '#FFF9E5',
    '#FFF6DB',
    '#FFF0C2',
    '#FFE9A8',
    '#FFE38F',
    '#FFDD75',
    '#FFD65C',
    '#FFD042',
    '#FFC929',
    '#FFC30F',
    '#5E4418',
]
const purple: MantineColorsTuple = [
    '#EAE8FC',
    '#D5D2F9',
    '#A7A0F3',
    '#7D73ED',
    '#4F42E6',
    '#291BC4',
    '#2317AB',
    '#19107A',
    '#100A4C',
    '#070524',
]
// SI UI Component Library → color primitive / navy. This is the library's brand ramp: the semantic
// tokens brand/Default, brand/Hover and brand/Light resolve to navy 5, 6 and 0 respectively, which is
// what makes Mantine's own filled/hover shade arithmetic (primaryShade, then +1 on hover) land exactly
// on the spec without per-variant overrides.
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
const blue: MantineColorsTuple = [
    '#D6E9FF',
    '#BDDCFF',
    '#94C6FF',
    '#6BB0FF',
    '#3D98FF',
    '#1482FF',
    '#006DEB',
    '#0058BD',
    '#004594',
    '#00326B',
    '#01215E',
]

type ExtendedCustomColors =
    | 'navy'
    | 'purple'
    | 'blue'
    | 'charcoal'
    | 'grey'
    | 'red'
    | 'green'
    | 'yellow'
    | DefaultMantineColor

type ExtendedCustomSpacing = 'xxl' | DefaultMantineSize

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
        charcoal,
        grey,
        red,
        green,
        yellow,
        purple,
        blue,
    },
    components: {
        TextInput: {
            defaultProps: {
                color: charcoal[9],
            },
        },
        Table: {
            styles: () => ({
                th: {
                    backgroundColor: grey[10],
                },
            }),
        },
        Button: {
            defaultProps: {
                color: 'navy',
                radius: 2, // Corner-radius-xs
            },
            // Mantine derives outline/subtle hover from its own light-hover alpha, which is not the
            // library's brand/Light. Only those two variants need correcting; filled already resolves
            // to brand/Default → brand/Hover via primaryShade.
            vars: (_theme: unknown, props: { variant?: string }) => ({
                root: props.variant === 'outline' || props.variant === 'subtle' ? { '--button-hover': navy[0] } : {},
            }),
            styles: () => ({
                root: {
                    '&:disabled, &[data-disabled]': {
                        backgroundColor: grey[1],
                        color: charcoal[6],
                        borderColor: 'transparent',
                    },
                },
            }),
        },
    },
    primaryShade: 5,
    primaryColor: 'purple',
    spacing: {
        xs: '0.5rem',
        xxl: '2.5rem',
    },
})

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
    variables: {
        '--mantine-color-placeholder': theme.colors.grey[7],
        '--mantine-color-dimmed': theme.colors.gray[7],
    },
    dark: {},
    light: {},
})
