import { createTheme, DefaultMantineColor, MantineColorsTuple } from '@mantine/core'

const siPurple: MantineColorsTuple = [
    '#eeecff',
    '#d8d5fc',
    '#aea8f3',
    '#8177eb',
    '#5c4ee4',
    '#4435e1',
    '#291BC4',
    '#2a1bc7',
    '#2317b3',
    '#19129e',
]

type ExtendedCustomColors = 'siPurple' | DefaultMantineColor

declare module '@mantine/core' {
    export interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>
    }
}

export const theme = createTheme({
    fontFamily: 'Open Sans',
    colors: {
        siPurple: siPurple,
    },
    primaryColor: 'siPurple',
})
