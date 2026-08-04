import { describe, expect, it } from 'vitest'
import { theme } from '@/theme'
import { STATUS_BANNER_BG } from './status-banner-colors'

// Resolve a Mantine "color.shade" token (e.g. "green.0") to its concrete hex via the theme palette.
function resolveToken(token: string): string {
    const [color, shade] = token.split('.')
    const tuple = theme.colors?.[color as keyof typeof theme.colors]
    return tuple?.[Number(shade)] ?? ''
}

// OTTER-652: the status-banner backgrounds must resolve to these exact hexes, which mirror the
// Figma design-system "Light" semantic tokens. Locking the token -> hex mapping catches both an
// accidental token change here and a palette reorder in theme.ts.
describe('STATUS_BANNER_BG', () => {
    it.each([
        ['approved', '#E8F8EB'], // Figma Color/Success/Light
        ['rejected', '#FFE0E0'], // Figma Color/Error/Light
        ['changesRequestedReviewer', '#FFF9E5'], // Figma Color/Warning/Light
        ['changesRequestedResearcher', '#EAE8FC'], // Figma Color/Brand/Light
    ] as const)('%s resolves to %s', (key, hex) => {
        expect(resolveToken(STATUS_BANNER_BG[key]).toUpperCase()).toBe(hex)
    })
})
