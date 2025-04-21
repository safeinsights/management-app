import { createTheme, DefaultMantineColor, MantineColorsTuple, MantineTheme} from '@mantine/core'

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
]

type ExtendedCustomColors = 'purple' | 'blue' | 'charcoal' | 'grey' | 'red' | 'green' | 'yellow' | DefaultMantineColor

declare module '@mantine/core' {
    export interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>
    }
}

export const theme = createTheme({
    fontFamily: 'Open Sans',
    headings: {
        fontFamily: 'Open Sans',
        fontWeight: '700',
    },
    fontWeights: {
        normal: '400',
        semiBold: '600',
        bold: '700',
    },
    colors: {
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
        // Title: {
        //     styles: (theme: MantineTheme, params: { order: number }) => ({
        //         root: {
        //             padding: params.order === 1 ? '20px 80px 20px 40px' : theme.spacing.xs,
        //             fontWeight: params.order === 5 ? '600' : '700',
        //         },
        //     }),
        // },
    },
    primaryShade: 5,
    primaryColor: 'purple',
})
