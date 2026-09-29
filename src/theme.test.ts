import type { ButtonVariant } from '@mantine/core'
import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { buttonVars, cssVariablesResolver, theme } from './theme'
import { semanticShades } from './theme/tokens'

// Locks the values transcribed from the SI UI Component Library Figma file. Hex values are
// hand-copied from its Variables panel, so drift would otherwise be invisible in review.
describe('palette', () => {
    it('carries the library brand ramp', () => {
        const navy = theme.colors?.navy ?? []
        expect(navy[5]).toBe('#01215e')
        expect(navy[6]).toBe('#011a4b')
        expect(navy[0]).toBe('#e6e9ef')
    })

    // Figma indexes every ramp 0-9 and defines no 950 step. An eleventh entry makes Mantine emit
    // --mantine-color-<name>-10, which call sites then depend on — the bug this card had to unpick.
    it.each(['navy', 'turquoise', 'red', 'green', 'yellow', 'blue', 'purple', 'grey', 'charcoal'])(
        'gives %s exactly ten shades',
        (name) => {
            expect(theme.colors?.[name]).toHaveLength(10)
        },
    )

    it('takes brand/default as the primary colour', () => {
        expect(theme.primaryColor).toBe('navy')
        expect(theme.primaryShade).toBe(5)
    })

    // Every semantic token must point at a shade that exists, or it silently resolves to undefined.
    it.each(Object.entries(semanticShades))('resolves %s -> %s', (_token, ref) => {
        const [family, shade] = ref.split('.')
        expect(theme.colors?.[family]?.[Number(shade)]).toMatch(/^#[0-9a-f]{6}$/)
    })
})

// A blanket resize default is deliberately absent: Mantine floors a multiline input at one row,
// not at its own height, so a handle without a matching minHeight could be dragged under the
// height the field loads at (OTTER-787). Each resizable field sets both for itself.
describe('textarea', () => {
    it('turns no resize handle on by default', () => {
        expect(theme.components?.Textarea?.defaultProps?.resize).toBeUndefined()
    })
})

describe('buttons', () => {
    // light resolves its hover from the same alpha as outline and subtle, so it needs the override
    // too — missing it was the gap review caught.
    it.each<ButtonVariant>(['outline', 'subtle', 'light'])('supplies brand/light as the %s hover', (variant) => {
        expect(buttonVars({}, { variant }).root['--button-hover']).toBe('#e6e9ef')
    })

    it.each<ButtonVariant>(['filled', 'default', 'gradient', 'transparent', 'white'])(
        'leaves the %s hover to Mantine',
        (variant) => {
            expect(buttonVars({}, { variant }).root).not.toHaveProperty('--button-hover')
        },
    )

    it('resolves error idle and hover to the library error tokens', () => {
        const mantineTheme = mergeMantineTheme(DEFAULT_THEME, theme)
        expect(theme.colors?.red?.[6]).toBe('#a83028')
        expect(theme.colors?.red?.[7]).toBe('#7e241e')
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

    // QA rejected the first attempt because these lived in a `styles` callback, which Mantine emits
    // as an inline style — the :disabled selector it needed was dropped by the browser and every
    // button kept Mantine's stock grey. Asserting the custom properties keeps the delivery
    // mechanism, not just the hexes, under test.
    it.each<ButtonVariant>(['filled', 'outline', 'subtle', 'light', 'default'])(
        'paints the disabled %s button from the library greys',
        (variant) => {
            expect(buttonVars({}, { variant }).root).toMatchObject({
                '--mantine-color-disabled': '#dadee1',
                '--mantine-color-disabled-color': '#595959',
            })
        },
    )

    it('no longer ships button colours through a styles callback', () => {
        expect(theme.components?.Button).not.toHaveProperty('styles')
    })

    it('carries the library size geometry alongside the colours', () => {
        expect(buttonVars({}, { size: 'lg' }).root).toMatchObject({
            '--button-height': '50px',
            '--button-padding-x': '26px',
            '--button-fz': '18px',
        })
    })

    it('falls back to the md geometry for an unsized button', () => {
        expect(buttonVars({}, {}).root['--button-height']).toBe('42px')
    })
})

// Locks the mandatory-field asterisk (OTTER-769). Figma status/error/text-icon, i.e. red.7 on
// the ten-shade ramp.
describe('required asterisk color', () => {
    it('carries the library error value', () => {
        expect(theme.colors?.red?.[7]).toBe('#7e241e')
    })

    // Every Mantine asterisk resolves through this one entry, Radio.Group's included, because
    // Input.Label registers its styles under the InputWrapper name.
    it('paints every Mantine-rendered asterisk from it', () => {
        const styles = theme.components?.InputWrapper?.styles as { required?: { color?: string } } | undefined

        expect(styles?.required?.color).toBe('#7e241e')
    })
})

// Mantine builds every ramp's light/subtle variant from primaryShade, which is how yellow.5 text
// ended up on a yellow tint at 2.2:1. Figma's Badge and Alert pages pair bg-light with text-icon,
// and the neutral badge is grey/0 under text/Sub-labels, so those five ramps read their variant
// variables from the tokens. They must come from the `light` slot: Mantine emits its own under
// :root[data-mantine-color-scheme], which outranks the plain :root the `variables` slot renders to.
describe('light variant pairs', () => {
    const resolved = cssVariablesResolver(mergeMantineTheme(DEFAULT_THEME, theme))

    it.each([
        ['red', '#fbeceb', '#7e241e', '#f6d8d6'],
        ['green', '#ecf4ee', '#285831', '#d9e9dc'],
        ['yellow', '#fffae7', '#5e4418', '#fbeed8'],
        ['blue', '#e7f1fe', '#004594', '#bddcff'],
        ['grey', '#f1f3f5', '#404040', '#dadee1'],
    ])('pairs the %s light variant with the library tokens', (ramp, bg, text, hover) => {
        expect(resolved.light[`--mantine-color-${ramp}-light`]).toBe(bg)
        expect(resolved.light[`--mantine-color-${ramp}-light-color`]).toBe(text)
        expect(resolved.light[`--mantine-color-${ramp}-light-hover`]).toBe(hover)
    })

    it('leaves the brand ramp on Mantine defaults', () => {
        expect(resolved.light).not.toHaveProperty('--mantine-color-navy-light-color')
    })

    // error, dimmed and placeholder were shadowed for the same reason; they move with the new ones.
    it('rewires Mantine built-ins from the scheme slot, not the root slot', () => {
        expect(resolved.light['--mantine-color-error']).toBe('#7e241e')
        expect(resolved.light['--mantine-color-dimmed']).toBe('#404040')
        expect(resolved.dark['--mantine-color-error']).toBe('#7e241e')
        expect(resolved.variables).not.toHaveProperty('--mantine-color-error')
    })
})
