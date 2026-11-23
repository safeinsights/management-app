import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { ImageStatusBadge, imageErrorText } from './code-envs-view'

describe('ImageStatusBadge', () => {
    // No row means the IDE does not run on MicroVMs here, or no build was asked for yet.
    it('shows nothing when the url has no image row', () => {
        renderWithProviders(<ImageStatusBadge status={null} error={null} />)
        expect(screen.queryByText(/IDE Image/)).toBeNull()
    })

    it('shows that a build is in progress', () => {
        renderWithProviders(<ImageStatusBadge status="IMAGE-RUNNING" error={null} />)
        expect(screen.getByText('Building IDE Image...')).toBeDefined()
    })

    it('shows a failed build with what the admin can do about it', () => {
        renderWithProviders(<ImageStatusBadge status="IMAGE-FAILED" error="BASE_IMAGE_UNAVAILABLE" />)
        const badge = screen.getByText('IDE Image Failed')
        expect(badge.closest('[title]')?.getAttribute('title')).toBe(imageErrorText('BASE_IMAGE_UNAVAILABLE'))
    })
})

describe('imageErrorText', () => {
    it('explains each code that an org admin can act on', () => {
        expect(imageErrorText('BASE_IMAGE_UNAVAILABLE')).toMatch(/URL/)
        expect(imageErrorText('UNSUPPORTED_PLATFORM: linux/arm64')).toMatch(/linux\/arm64/)
    })

    // Codes are a contract with iac, but a new or unknown one must still give a sentence.
    it('gives a general sentence for every other code', () => {
        expect(imageErrorText('MICROVM_BUILD_FAILED: CREATE_FAILED')).toMatch(/SafeInsights support/)
        expect(imageErrorText('SOMETHING_NEW')).toMatch(/SafeInsights support/)
        expect(imageErrorText(null)).toMatch(/SafeInsights support/)
    })
})
