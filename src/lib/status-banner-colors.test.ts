import { describe, expect, it } from 'vitest'
import { theme } from '@/theme'
import { STATUS_BANNER_BG } from './status-banner-colors'

function resolveToken(token: string): string {
    const [color, shade] = token.split('.')
    const tuple = theme.colors?.[color as keyof typeof theme.colors]
    return tuple?.[Number(shade)] ?? ''
}

// Locking the token -> hex mapping catches an accidental token change here and a palette reorder
// in theme.ts (OTTER-652).
describe('STATUS_BANNER_BG', () => {
    it.each([
        ['approved', '#E8F8EB'],
        ['rejected', '#FFE0E0'],
        ['changesRequestedReviewer', '#FFF9E5'],
        ['changesRequestedResearcher', '#EAE8FC'],
    ] as const)('%s resolves to %s', (key, hex) => {
        expect(resolveToken(STATUS_BANNER_BG[key]).toUpperCase()).toBe(hex)
    })
})
