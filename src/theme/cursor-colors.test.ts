import { luminance, toRgba } from '@mantine/core'
import { describe, expect, it } from '@/tests/unit.helpers'
import { theme } from '@/theme'
import { CURSOR_COLORS } from './cursor-colors'

const shadeOf = (cssVar: string) => {
    const [, family, shade] = cssVar.match(/^var\(--mantine-color-([a-z]+)-(\d)\)$/) ?? []
    const hex = theme.colors?.[family]?.[Number(shade)]
    if (!hex) throw new Error(`${cssVar} is not a theme shade`)
    return hex
}

// Mantine paints a light badge in a non-theme color over that color at 10%, and both "Also
// editing" lists sit on a white Paper.
const tintOnWhite = (hex: string) => {
    const { r, g, b } = toRgba(hex)
    const mix = (channel: number) => Math.round(channel * 0.1 + 255 * 0.9)
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

const contrast = (a: string, b: string) => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (lighter + 0.05) / (darker + 0.05)
}

describe('CURSOR_COLORS', () => {
    it.each(CURSOR_COLORS)('holds 4.5:1 as the Also editing badge text on its own tint: %s', (color) => {
        const hex = shadeOf(color)
        expect(contrast(hex, tintOnWhite(hex))).toBeGreaterThanOrEqual(4.5)
    })

    it.each(CURSOR_COLORS)('holds 4.5:1 under the white cursor name label: %s', (color) => {
        expect(contrast('#ffffff', shadeOf(color))).toBeGreaterThanOrEqual(4.5)
    })
})
