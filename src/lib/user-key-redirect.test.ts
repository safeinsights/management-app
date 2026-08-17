import { describe, expect, it } from 'vitest'
import { Routes } from '@/lib/routes'
import { keyGenerationUrl } from './user-key-redirect'

describe('keyGenerationUrl', () => {
    it('carries an explicit destination through key generation', () => {
        expect(keyGenerationUrl('/openstax-lab/dashboard')).toBe(
            '/account/keys?redirect_url=%2Fopenstax-lab%2Fdashboard',
        )
    })

    it('returns a bare url when there is no destination', () => {
        expect(keyGenerationUrl(null)).toBe(Routes.accountKeys)
        expect(keyGenerationUrl(undefined)).toBe(Routes.accountKeys)
        expect(keyGenerationUrl('')).toBe(Routes.accountKeys)
    })

    // safeRedirectUrl returns the dashboard for a rejected redirect_url, so forwarding it would pin
    // the key page to "My dashboard" instead of letting it resolve the account's landing.
    it('treats the dashboard as no destination so the key page still resolves its own landing', () => {
        expect(keyGenerationUrl(Routes.dashboard)).toBe(Routes.accountKeys)
    })
})
