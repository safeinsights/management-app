import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import AboutPage from './page'

const linkFor = (label: string) => screen.getByText(label).closest('a')

describe('AboutPage deployed versions', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV }
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
    })

    it('links the infrastructure commit to the iac repo, not the app repo', () => {
        process.env.IAC_VERSION = '37cfdea'
        renderWithProviders(<AboutPage />)

        expect(linkFor('37cfdea')).toHaveAttribute('href', 'https://github.com/safeinsights/iac/commit/37cfdea')
    })

    it('shows a decorated git describe value as text, since it is not a linkable ref', () => {
        process.env.IAC_VERSION = '37cfdea-dirty'
        renderWithProviders(<AboutPage />)

        expect(screen.getByText('37cfdea-dirty')).toBeDefined()
        expect(linkFor('37cfdea-dirty')).toBeNull()
    })

    it('shows the unknown sentinel as text when git was unavailable at synth', () => {
        process.env.IAC_VERSION = 'unknown'
        renderWithProviders(<AboutPage />)

        expect(linkFor('unknown')).toBeNull()
    })

    it('links the editor release to the app repo it was built from', () => {
        process.env.EDITOR_RELEASE_SHA = 'a3f4f84'
        renderWithProviders(<AboutPage />)

        expect(linkFor('a3f4f84')).toHaveAttribute(
            'href',
            'https://github.com/safeinsights/management-app/commit/a3f4f84',
        )
    })

    it('reports both as not deployed when the infrastructure has not supplied them', () => {
        delete process.env.IAC_VERSION
        delete process.env.EDITOR_RELEASE_SHA
        renderWithProviders(<AboutPage />)

        expect(screen.getAllByText('not deployed').length).toBeGreaterThanOrEqual(2)
    })
})
