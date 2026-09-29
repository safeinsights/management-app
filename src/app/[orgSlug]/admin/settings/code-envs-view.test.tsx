import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CodeEnvRowView, ScanStatusBadge } from './code-envs-view'

const noop = () => {}

const badgeStyle = (text: string) => screen.getByText(text).closest('.mantine-Badge-root')?.getAttribute('style') ?? ''

// QA measured Scan Passed at 2.13:1 and Testing at 2.23:1 on Mantine's stock teal and orange. The
// theme pairs the SI status ramps' light variant with the library tokens, so a badge only reaches
// that pairing by naming an SI ramp.
describe('code environment badges', () => {
    it('paints Scan Passed from the green light variant', () => {
        renderWithProviders(<ScanStatusBadge status="SCAN-COMPLETE" />)
        expect(badgeStyle('Scan Passed')).toContain('--mantine-color-green-light')
    })

    it('paints Scan Pending from the neutral grey light variant', () => {
        renderWithProviders(<ScanStatusBadge status="SCAN-PENDING" />)
        expect(badgeStyle('Scan Pending')).toContain('--mantine-color-grey-light')
    })

    it('paints Testing and Default from SI ramps', () => {
        renderWithProviders(
            <CodeEnvRowView
                name="R 4.4"
                language="R"
                isTesting
                isDefault
                latestScanStatus={null}
                detailOpened={false}
                onToggleDetail={noop}
                onLanguageBadgeClick={noop}
                onScanBadgeClick={noop}
                actions={null}
                detail={null}
            />,
        )
        expect(badgeStyle('Testing')).toContain('--mantine-color-yellow-light')
        expect(badgeStyle('Default')).toContain('--mantine-color-purple-filled')
    })
})
