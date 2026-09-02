import type { ButtonVariant } from '@mantine/core'
import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { buttonVars, theme } from './theme'

// Locks the values transcribed from the SI UI Component Library (OTTER-761). Hex values are
// hand-copied from Figma, so drift would otherwise be invisible in review.
describe('button colors', () => {
    const navy = theme.colors?.navy ?? []
    const mantineTheme = mergeMantineTheme(DEFAULT_THEME, theme)

    it('carries the library brand ramp', () => {
        expect(navy[5]).toBe('#01215E')
        expect(navy[6]).toBe('#011A4B')
        expect(navy[0]).toBe('#E6E9EF')
    })

    it('makes every button navy without repainting the rest of the app', () => {
        expect(theme.components?.Button?.defaultProps).toEqual({ color: 'navy' })
        expect(theme.components?.Button?.vars).toBe(buttonVars)
        expect(theme.primaryColor).toBe('purple')
    })

    it('resolves filled to brand/Default and its hover to brand/Hover via primaryShade', () => {
        expect(theme.primaryShade).toBe(5)
        expect(navy[(theme.primaryShade as number) + 1]).toBe('#011A4B')
    })

    // light resolves its hover from the same alpha as outline and subtle, so it needs the override
    // too — missing it was the gap review caught.
    it.each<ButtonVariant>(['outline', 'subtle', 'light'])('supplies brand/Light as the %s hover', (variant) => {
        expect(buttonVars({}, { variant }).root).toEqual({ '--button-hover': '#E6E9EF' })
    })

    it.each<ButtonVariant>(['filled', 'default', 'gradient', 'transparent', 'white'])(
        'leaves the %s hover to Mantine',
        (variant) => {
            expect(buttonVars({}, { variant }).root).toEqual({})
        },
    )

    it('resolves error idle and hover to the library error tokens', () => {
        expect(theme.colors?.red?.[10]).toBe('#A83028')
        expect(theme.colors?.red?.[11]).toBe('#7E241E')
        expect(
            theme.variantColorResolver?.({
                variant: 'error',
                color: 'navy',
                theme: mantineTheme,
                autoContrast: false,
            }),
        ).toEqual({
            background: 'var(--mantine-color-error-filled)',
            hover: 'var(--mantine-color-error)',
            color: 'var(--mantine-color-white)',
            border: 'none',
        })
    })
})
