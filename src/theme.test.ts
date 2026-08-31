import { describe, expect, it } from 'vitest'
import { theme } from './theme'

// Hex values are hand-copied from Figma, so drift would otherwise be invisible in review.
describe('button colors', () => {
    const navy = theme.colors?.navy ?? []
    const buttonVars = theme.components?.Button?.vars as (
        t: unknown,
        p: { variant?: string },
    ) => { root: Record<string, string> }

    it('carries the library brand ramp', () => {
        expect(navy[5]).toBe('#01215E')
        expect(navy[6]).toBe('#011A4B')
        expect(navy[0]).toBe('#E6E9EF')
    })

    it('makes every button navy without repainting the rest of the app', () => {
        expect(theme.components?.Button?.defaultProps).toEqual({ color: 'navy' })
        expect(theme.primaryColor).toBe('purple')
    })

    it('resolves filled to brand/Default and its hover to brand/Hover via primaryShade', () => {
        expect(theme.primaryShade).toBe(5)
        expect(navy[(theme.primaryShade as number) + 1]).toBe('#011A4B')
    })

    // light resolves its hover from the same alpha as outline and subtle, so it needs the override
    // too — missing it was the gap review caught.
    it.each(['outline', 'subtle', 'light'])('supplies brand/Light as the %s hover', (variant) => {
        expect(buttonVars({}, { variant }).root).toEqual({ '--button-hover': '#E6E9EF' })
    })

    it.each(['filled', 'default', 'gradient', 'transparent', 'white'])('leaves the %s hover to Mantine', (variant) => {
        expect(buttonVars({}, { variant }).root).toEqual({})
    })
})
