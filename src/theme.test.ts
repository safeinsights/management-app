import { describe, expect, it } from 'vitest'
import { theme } from './theme'

// Locks the values transcribed from the SI UI Component Library (OTTER-673). These are hand-copied
// from Figma, so a silent drift here is invisible in review — hence asserting them directly.
describe('button colors', () => {
    const navy = theme.colors?.navy ?? []

    it('carries the library brand ramp', () => {
        expect(navy[5]).toBe('#01215E') // brand/Default
        expect(navy[6]).toBe('#011A4B') // brand/Hover
        expect(navy[0]).toBe('#E6E9EF') // brand/Light
    })

    it('makes every button navy without repainting the rest of the app', () => {
        expect(theme.components?.Button?.defaultProps).toMatchObject({ color: 'navy', radius: 2 })
        // primaryColor also drives checkboxes, radios, switches, tabs and focus rings — out of scope.
        expect(theme.primaryColor).toBe('purple')
    })

    it('resolves filled to brand/Default and its hover to brand/Hover via primaryShade', () => {
        expect(theme.primaryShade).toBe(5)
        expect(navy[(theme.primaryShade as number) + 1]).toBe('#011A4B')
    })

    it('overrides hover only for the variants Mantine would otherwise get wrong', () => {
        const vars = theme.components?.Button?.vars as
            | ((t: unknown, p: { variant?: string }) => { root: Record<string, string> })
            | undefined

        expect(vars?.({}, { variant: 'outline' }).root).toEqual({ '--button-hover': '#E6E9EF' })
        expect(vars?.({}, { variant: 'subtle' }).root).toEqual({ '--button-hover': '#E6E9EF' })
        expect(vars?.({}, { variant: 'filled' }).root).toEqual({})
    })
})
