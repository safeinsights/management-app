import type { ButtonVariant } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { buttonVars, theme } from './theme'

// Locks the values transcribed from the SI UI Component Library (OTTER-761). Hex values are
// hand-copied from Figma, so drift would otherwise be invisible in review.
describe('button colors', () => {
    const navy = theme.colors?.navy ?? []

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
        expect(buttonVars({}, { variant }).root['--button-hover']).toBe('#E6E9EF')
    })

    it.each<ButtonVariant>(['filled', 'default', 'gradient', 'transparent', 'white'])(
        'leaves the %s hover to Mantine',
        (variant) => {
            expect(buttonVars({}, { variant }).root).not.toHaveProperty('--button-hover')
        },
    )

    // QA rejected the first attempt because these lived in a `styles` callback, which Mantine emits
    // as an inline style — the :disabled selector it needed was dropped by the browser and every
    // button kept Mantine's stock grey. Asserting the custom properties keeps the delivery
    // mechanism, not just the hexes, under test.
    it.each<ButtonVariant>(['filled', 'outline', 'subtle', 'light', 'default'])(
        'paints the disabled %s button from the library greys',
        (variant) => {
            expect(buttonVars({}, { variant }).root).toMatchObject({
                '--mantine-color-disabled': '#DADEE1',
                '--mantine-color-disabled-color': '#595959',
            })
        },
    )

    it('no longer ships button colours through a styles callback', () => {
        expect(theme.components?.Button).not.toHaveProperty('styles')
    })
})
